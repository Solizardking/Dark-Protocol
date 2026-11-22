import { PublicKey } from '@solana/web3.js';

/**
 * Program-facing types for the merged Dark Protocol program
 * (TRANSPLANT-SPEC W6). The merged program is the Groth16 shielded SOL
 * pool: exactly two account types, three events, four instructions.
 *
 * The legacy account shapes that used to live here (ShieldedAddress,
 * per-note Note accounts, PrivacyPool, AIAgent, swap route types) are
 * GONE — those accounts and instructions were dropped in the transplant,
 * not ported. See MIGRATION-0.2.0.md.
 */

/** The single global pool account (PDA seeds: ["pool"]). */
export interface PoolState {
  authority: PublicKey;
  currentRoot: Uint8Array;
  rootHistory: Uint8Array[];
  historyNext: number;
  historyLen: number;
  frontier: Uint8Array[];
  nextLeafIndex: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  /** Mirrors the program's compiled VK status at initialize time. */
  vkIsPlaceholder: boolean;
  bump: number;
  vaultBump: number;
}

/** Spent-nullifier marker (PDA seeds: ["nf", nf]). Existence IS the record. */
export interface NullifierMarker {
  nf: Uint8Array;
  slot: bigint;
  bump: number;
}

/** deposit(amount, cm) parameters — shield in SDK language. */
export interface ShieldParams {
  /** Lamports to shield (native SOL only in v1). */
  amount: bigint | number;
  /** Note commitment cm = Poseidon(owner_id, value, blinding), 32-byte BE field element. */
  cm: Uint8Array;
}

/** withdraw(proof, root, nf, amount) parameters — unshield in SDK language. */
export interface UnshieldParams {
  /** 256-byte Groth16 proof: A(64) ‖ B(128) ‖ C(64), groth16-solana layout. */
  proof: Uint8Array;
  /** A root from the pool's 32-entry root-history ring. */
  root: Uint8Array;
  /** Nullifier nf = Poseidon(nk, leaf_index), 32-byte BE field element. */
  nf: Uint8Array;
  /** Lamports to withdraw; must equal the note's full value (v1 is full-note spend). */
  amount: bigint | number;
  /** Payee. The program derives the proof's recipient input from this
   *  account's pubkey — a proof cannot be redirected to another payee. */
  recipient: PublicKey;
  /** Pays the nullifier marker's rent. Any signer may relay. */
  feePayer: PublicKey;
}

export interface PrivatePaymentParams {
  rail: 'x402' | 'ap2' | 'm2m';
  settlement: 'solana' | 'evm';
  proofLayer: 'solana' | 'evm';
  durableReceipt: boolean;
  paymentCommitment: Uint8Array;
}

export enum TransactionType {
  Shield = 'Shield',
  Unshield = 'Unshield',
  PrivatePayment = 'PrivatePayment',
}
