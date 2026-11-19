import {
  generateSigningKeypair,
  generateBoxKeypair,
  sign,
  verifySignature,
  sha256,
  toHex,
  toBase58,
  fromBase58,
  type SigningKeypair,
  type BoxKeypair,
} from "../crypto.js";

export type TeeProvider = "local-dev" | "sgx" | "sev-snp" | "dstack" | "redpill";

/**
 * What the enclave commits to: the code/model identity it is running. In a real
 * SGX/SEV flow this is the MRENCLAVE / launch measurement; here it is a stable
 * hash over the agent's declared model + policy so it is reproducible offline.
 */
export interface EnclaveIdentity {
  /** Logical agent id. */
  agentId: string;
  /** Inference model the enclave runs (e.g. "phala/deepseek-r1-tee"). */
  model: string;
  /** Free-form policy / capability descriptor hashed into the measurement. */
  policy?: string;
}

export interface TeeQuote {
  provider: TeeProvider;
  /** hex SHA-256 measurement (MRENCLAVE analogue). */
  measurement: string;
  /** base58 ed25519 public key the enclave signs reports with. */
  signingPublicKey: string;
  /** base58 x25519 public key clients seal confidential payloads to. */
  encryptionPublicKey: string;
  /** Unix seconds. */
  timestamp: number;
  /** base58 ed25519 signature over the canonical report bytes. */
  signature: string;
  /** Echo of the identity for verifiers. */
  identity: EnclaveIdentity;
  /**
   * Hardware quotes only: hex SHA-256 of the raw hardware evidence (SGX DCAP /
   * SEV-SNP report / dstack quote). Bound into the signed report so the
   * evidence cannot be swapped after signing. Absent on `local-dev` quotes.
   */
  evidenceDigest?: string;
}

/** The full enclave key material — secret keys never leave the TEE. */
export interface TeeEnclave {
  quote: TeeQuote;
  signing: SigningKeypair;
  encryption: BoxKeypair;
}

export function computeMeasurement(identity: EnclaveIdentity): string {
  const canonical = `dark-tee/v1|${identity.agentId}|${identity.model}|${identity.policy ?? ""}`;
  return toHex(sha256(canonical));
}

const HEX_RE = /^[0-9a-f]+$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
/** Clock skew tolerated for quote timestamps that appear to be in the future. */
const MAX_FUTURE_SKEW_SECONDS = 300;

function canonicalReport(parts: {
  measurement: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  timestamp: number;
  identity: EnclaveIdentity;
  evidenceDigest?: string;
}): Uint8Array {
  const lines = [
    "dark-tee-report/v1",
    parts.measurement,
    parts.signingPublicKey,
    parts.encryptionPublicKey,
    String(parts.timestamp),
    parts.identity.agentId,
    parts.identity.model,
    parts.identity.policy ?? "",
  ];
  // Hardware quotes additionally commit to their evidence. Local-dev reports
  // are byte-identical to the original v1 format.
  if (parts.evidenceDigest !== undefined) lines.push(`evidence:${parts.evidenceDigest}`);
  return new TextEncoder().encode(lines.join("\n"));
}

/**
 * The exact bytes an enclave must sign (with the key it advertises as
 * `signingPublicKey`) for {@link importHardwareQuote} to produce a quote that
 * {@link verifyTeeQuote} accepts.
 */
export function hardwareReportBytes(parts: {
  measurement: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  timestamp: number;
  identity: EnclaveIdentity;
  rawQuote: Uint8Array;
}): Uint8Array {
  return canonicalReport({
    measurement: parts.measurement.toLowerCase(),
    signingPublicKey: parts.signingPublicKey,
    encryptionPublicKey: parts.encryptionPublicKey,
    timestamp: parts.timestamp,
    identity: parts.identity,
    evidenceDigest: toHex(sha256(parts.rawQuote)),
  });
}

/**
 * Spin up a (dev) enclave: generate its key material and self-sign a quote.
 *
 * `provider: "local-dev"` produces a quote whose signing key IS the report key,
 * so it verifies offline without external hardware. Real providers (SGX/SEV/
 * dstack) replace {@link generateTeeQuote} output with hardware-rooted quotes
 * via {@link importHardwareQuote}. A quote generated here but labelled with a
 * hardware provider has no hardware evidence, so {@link verifyTeeQuote}
 * rejects it.
 */
export function generateTeeQuote(
  identity: EnclaveIdentity,
  provider: TeeProvider = "local-dev"
): TeeEnclave {
  const signing = generateSigningKeypair();
  const encryption = generateBoxKeypair();
  const measurement = computeMeasurement(identity);
  const timestamp = Math.floor(Date.now() / 1000);
  const signingPublicKey = toBase58(signing.publicKey);
  const encryptionPublicKey = toBase58(encryption.publicKey);

  const report = canonicalReport({
    measurement,
    signingPublicKey,
    encryptionPublicKey,
    timestamp,
    identity,
  });
  const signature = toBase58(sign(report, signing.secretKey));

  return {
    quote: {
      provider,
      measurement,
      signingPublicKey,
      encryptionPublicKey,
      timestamp,
      signature,
      identity,
    },
    signing,
    encryption,
  };
}

export interface QuoteVerification {
  valid: boolean;
  reasons: string[];
}

/**
 * Verify a TEE quote. Fails closed: any problem adds a reason and `valid` is
 * false.
 *
 * - `local-dev` quotes: the measurement must equal
 *   {@link computeMeasurement}(identity) (a software identity hash).
 * - Hardware quotes (`sgx` / `sev-snp` / `dstack` / `redpill`): the measurement
 *   is the hardware launch measurement (MRENCLAVE / MRTD / SNP measurement),
 *   which cannot be recomputed from the identity. It must instead be listed in
 *   `allowedMeasurements` (required; no allow-list means rejection), and the
 *   quote must carry an `evidenceDigest` bound into the signed report. Pass
 *   `rawQuote` to also check the digest against the raw evidence bytes.
 *
 * In every case the report signature must verify under `signingPublicKey`, the
 * provider must be allow-listed if `allowedProviders` is given, and the quote
 * must be fresh if `maxAgeSeconds` is given.
 *
 * Note: this does not appraise the hardware vendor's certificate chain
 * (Intel PCS / AMD KDS). Do that out-of-band before trusting `rawQuote`.
 */
export function verifyTeeQuote(
  quote: TeeQuote,
  opts: {
    allowedMeasurements?: string[];
    allowedProviders?: TeeProvider[];
    maxAgeSeconds?: number;
    /** Raw hardware evidence to re-hash against `quote.evidenceDigest`. */
    rawQuote?: Uint8Array;
  } = {}
): QuoteVerification {
  const reasons: string[] = [];
  const measurement = String(quote.measurement ?? "").toLowerCase();
  const allowed = opts.allowedMeasurements?.map((m) => m.toLowerCase());
  const isHardware = quote.provider !== "local-dev";

  if (!measurement || !HEX_RE.test(measurement)) {
    reasons.push("measurement is not a hex string");
  }

  if (isHardware) {
    if (quote.evidenceDigest === undefined || !HEX64_RE.test(quote.evidenceDigest)) {
      reasons.push("hardware quote carries no hardware evidence digest");
    }
    if (!allowed || allowed.length === 0) {
      reasons.push("hardware quotes require an allowedMeasurements allow-list");
    }
    if (opts.rawQuote !== undefined) {
      if (toHex(sha256(opts.rawQuote)) !== quote.evidenceDigest) {
        reasons.push("raw hardware evidence does not match the quote's evidence digest");
      }
    }
  } else {
    if (computeMeasurement(quote.identity) !== measurement) {
      reasons.push("measurement does not match declared enclave identity");
    }
    if (quote.evidenceDigest !== undefined) {
      reasons.push("local-dev quote must not carry hardware evidence");
    }
  }

  let sigOk = false;
  try {
    const report = canonicalReport({
      measurement: quote.measurement,
      signingPublicKey: quote.signingPublicKey,
      encryptionPublicKey: quote.encryptionPublicKey,
      timestamp: quote.timestamp,
      identity: quote.identity,
      evidenceDigest: quote.evidenceDigest,
    });
    sigOk = verifySignature(
      report,
      fromBase58(quote.signature),
      fromBase58(quote.signingPublicKey)
    );
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    reasons.push("report signature is invalid");
  }

  if (allowed && !allowed.includes(measurement)) {
    reasons.push("measurement is not in the allow-list");
  }

  if (opts.allowedProviders && !opts.allowedProviders.includes(quote.provider)) {
    reasons.push(`provider "${quote.provider}" is not allowed`);
  }

  if (!Number.isFinite(quote.timestamp)) {
    reasons.push("quote timestamp is invalid");
  } else if (opts.maxAgeSeconds !== undefined) {
    const age = Math.floor(Date.now() / 1000) - quote.timestamp;
    if (age > opts.maxAgeSeconds) {
      reasons.push(`quote is stale (${age}s > ${opts.maxAgeSeconds}s)`);
    }
    if (age < -MAX_FUTURE_SKEW_SECONDS) {
      reasons.push("quote timestamp is in the future");
    }
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Wrap a hardware-rooted quote (raw bytes from SGX DCAP / SEV-SNP / dstack)
 * into the Dark quote envelope.
 *
 * `measurement` is the hardware launch measurement reported by the evidence
 * (MRENCLAVE / MRTD / SNP measurement, hex). The raw evidence is hashed into
 * `evidenceDigest`, which is part of the signed report: the enclave must sign
 * {@link hardwareReportBytes} with the same `timestamp`. Verify the raw
 * evidence against the provider's PCS out-of-band before trusting it.
 */
export function importHardwareQuote(params: {
  provider: Exclude<TeeProvider, "local-dev">;
  identity: EnclaveIdentity;
  rawQuote: Uint8Array;
  measurement: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  signature: string;
  timestamp: number;
}): TeeQuote {
  if ((params.provider as TeeProvider) === "local-dev") {
    throw new Error("importHardwareQuote: local-dev is not a hardware provider");
  }
  return {
    provider: params.provider,
    measurement: params.measurement.toLowerCase(),
    signingPublicKey: params.signingPublicKey,
    encryptionPublicKey: params.encryptionPublicKey,
    timestamp: params.timestamp,
    signature: params.signature,
    identity: params.identity,
    evidenceDigest: toHex(sha256(params.rawQuote)),
  };
}
