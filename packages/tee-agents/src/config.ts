import { address, type Address } from "@solana/kit";

/**
 * On-chain program addresses used by the Dark TEE agent stack.
 *
 * The Solana Attestation Service (SAS) is the trust anchor: every confidential
 * agent's identity, TEE measurement, and paid-inference receipts are written as
 * SAS attestations under a Dark-controlled credential.
 */
export const PROGRAMS = {
  /** Solana Attestation Service program. */
  SAS: address("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"),
  /** Token-2022 (tokenized attestations). */
  TOKEN_2022: address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
  /** SAS event authority PDA. */
  EVENT_AUTHORITY: address("DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g"),
  /**
   * Current Dark Protocol note pool. Same program as the shielded wallet.
   * Executable on devnet. Not deployed on mainnet.
   */
  DARK_PROTOCOL: address("E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"),
  /** Alias of DARK_PROTOCOL. The separate legacy shielded-wallet id is retired. */
  SHIELDED_WALLET: address("E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm"),
} as const;

export type DarkNetwork = "devnet" | "mainnet" | "localnet";

export interface RpcEndpoints {
  http: string;
  ws: string;
}

/**
 * Resolve RPC endpoints for a network. Helius keys and dedicated/secure
 * endpoints come from the environment — never hardcode credentials.
 */
export function resolveEndpoints(
  network: DarkNetwork,
  heliusApiKey = process.env.HELIUS_API_KEY ?? ""
): RpcEndpoints {
  const secure = process.env.HELIUS_SECURE_RPC_URL;
  if (network === "localnet") {
    return { http: "http://127.0.0.1:8899", ws: "ws://127.0.0.1:8900" };
  }
  if (secure) {
    return { http: secure, ws: secure.replace(/^http/, "ws") };
  }
  const host = `${network}.helius-rpc.com`;
  return {
    http: `https://${host}/?api-key=${heliusApiKey}`,
    ws: `wss://${host}/?api-key=${heliusApiKey}`,
  };
}

/** Default credential name that anchors all Dark agent attestations. */
export const DARK_CREDENTIAL_NAME = "Dark Protocol Agents";

/** Known stable assets usable for x402 inference payments (mainnet mints). */
export const PAYMENT_ASSETS: Record<string, Address> = {
  USDC: address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  SOL: address("So11111111111111111111111111111111111111112"),
};
