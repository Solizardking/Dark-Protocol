/**
 * Canonical on-chain program addresses for the Dark Protocol stack.
 *
 * The Solana Attestation Service (SAS) is the trust anchor: every confidential
 * agent's identity, TEE measurement, and paid-inference receipts are written
 * as SAS attestations under a Dark-controlled credential.
 */

/** SAS program deployed by Solana Foundation (devnet + mainnet). */
export const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG" as const;

/** Token-2022 program (tokenised attestations). */
export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as const;

/** SAS event-authority PDA. */
export const SAS_EVENT_AUTHORITY =
  "DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g" as const;

/**
 * Current shielded note pool (`dark-protocol-program`).
 * The shielded wallet is this same program. Devnet has an executable
 * account; mainnet does not. Alpha and unaudited.
 */
export const DARK_PROTOCOL_PROGRAM_ID =
  "E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm" as const;

/** Alias. The note pool is the shielded wallet program. */
export const SHIELDED_WALLET_PROGRAM_ID = DARK_PROTOCOL_PROGRAM_ID;

/**
 * Historical devnet ids. Their program-id keypairs were published.
 * Do not build new transactions against them.
 */
export const LEGACY_DARK_PROTOCOL_PROGRAM_ID =
  "3KWLFYco7T2rUZkzjSSthjHGmbWmo9HAsRmvupDTomGC" as const;

export const LEGACY_SHIELDED_WALLET_PROGRAM_ID =
  "4753b1cCrPzwr7taWWD8yrcM8dc98fTR7wCFdv1TsAbg" as const;

/** Issuer name under which all Dark agent attestations are anchored. */
export const DARK_CREDENTIAL_NAME = "Dark Protocol Agents" as const;

/** Known stable assets usable for x402 inference payments (mainnet mints). */
export const PAYMENT_ASSETS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
} as const;
