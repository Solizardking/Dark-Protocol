/**
 * Dark Protocol SDK
 * Groth16 shielded SOL pool on Solana (SOL-only v1) + the intent/rail layer.
 * See MIGRATION-0.2.0.md for the 0.2.0 breaking changes (core transplant).
 */

export * from './client';
export * from './types';
export * from './config';
export * from './proving';
export * from './private-payment';
export * from './intent';
export * from './rail-authorization';
export * from './helius-dev-tools';

// Re-export commonly used Solana types
export {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

// Version
export const VERSION = '0.2.0';
