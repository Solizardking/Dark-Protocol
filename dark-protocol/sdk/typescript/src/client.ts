import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { createHelius } from 'helius-sdk';
import { createDarkProtocolConfigFromEnv, resolveHeliusRpcUrl, type DarkProtocolCluster } from './config';
import { DARK_PROTOCOL_IDL } from './idl/dark_protocol';
import type { PoolState, ShieldParams, UnshieldParams } from './types';
import type { PrivatePaymentReceipt } from './private-payment';
import {
  decodeDarkIntentMemo,
  readDarkMemoInstructionText,
  verifyPrivatePaymentIntentPayload,
  type DarkIntentVerificationResult,
} from './intent';

export interface DarkProtocolConfig {
  heliusApiKey?: string;
  jupiterApiKey?: string;
  redpillApiKey?: string;
  xaiApiKey?: string;
  xaiBaseUrl?: string;
  xaiModel?: string;
  cluster?: DarkProtocolCluster;
  rpcUrl?: string;
  programId?: PublicKey;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Client for the merged Dark Protocol program (TRANSPLANT-SPEC W6).
 *
 * The merged program is the Groth16 shielded SOL pool: one Pool PDA,
 * a lamport vault PDA, and per-nullifier marker PDAs. The legacy
 * getters (protocol state / merkle tree / shielded address / AI agent
 * accounts) are gone — those accounts were dropped in the transplant.
 *
 * PROGRAM ID: there is deliberately **no default**. The merged program
 * is not deployed; its fresh program ID is generated at deploy time in
 * work order W5 and propagated to declare_id! / Anchor.toml / this SDK
 * in one change. Until then, pass `programId` explicitly or set
 * DARK_PROTOCOL_PROGRAM_ID — construction throws otherwise, rather than
 * silently pointing at a retired or placeholder address.
 */
export class DarkProtocolClient {
  public readonly connection: Connection;
  public readonly program: Program;
  public readonly helius: ReturnType<typeof createHelius>;
  public readonly config: DarkProtocolConfig;

  private constructor(
    connection: Connection,
    program: Program,
    helius: ReturnType<typeof createHelius>,
    config: DarkProtocolConfig
  ) {
    this.connection = connection;
    this.program = program;
    this.helius = helius;
    this.config = config;
  }

  static async create(config: DarkProtocolConfig): Promise<DarkProtocolClient> {
    const programId = config.programId ?? createDarkProtocolConfigFromEnv().programId;
    if (!programId) {
      throw new Error(
        'Dark Protocol program ID is not configured. Pass `programId` or set ' +
        'DARK_PROTOCOL_PROGRAM_ID. There is no default: the merged program is ' +
        'not deployed yet and its fresh ID is generated at deploy time (W5).'
      );
    }

    const rpcUrl = config.rpcUrl || resolveHeliusRpcUrl({
      cluster: config.cluster ?? 'mainnet-beta',
      heliusApiKey: config.heliusApiKey,
    });
    const connection = new Connection(rpcUrl, config.commitment || 'confirmed');

    const helius = createHelius({
      apiKey: config.heliusApiKey ?? '',
      network: config.cluster === 'mainnet-beta' ? 'mainnet' : 'devnet',
    });

    const provider = new AnchorProvider(connection, {} as any, {
      commitment: config.commitment || 'confirmed'
    });

    const idl = { ...DARK_PROTOCOL_IDL, address: programId.toBase58() } as unknown as Idl;
    const program = new Program(idl, provider);

    return new DarkProtocolClient(connection, program, helius, { ...config, programId });
  }

  /**
   * Create a client using HELIUS_RPC_URL / HELIUS_API_KEY / SOLANA_CLUSTER /
   * DARK_PROTOCOL_PROGRAM_ID.
   */
  static async fromEnv(overrides: Partial<DarkProtocolConfig> = {}): Promise<DarkProtocolClient> {
    return DarkProtocolClient.create(createDarkProtocolConfigFromEnv(overrides));
  }

  /** The bundled IDL, regenerated from the merged crate (W6). */
  static loadIdl(): Idl {
    return DARK_PROTOCOL_IDL as unknown as Idl;
  }

  // ── PDA derivations ─────────────────────────────────────────────────

  static poolAddress(programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from('pool')], programId)[0];
  }

  static vaultAddress(programId: PublicKey): PublicKey {
    const pool = DarkProtocolClient.poolAddress(programId);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), pool.toBuffer()],
      programId
    )[0];
  }

  static nullifierMarkerAddress(programId: PublicKey, nf: Uint8Array): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('nf'), Buffer.from(nf)],
      programId
    )[0];
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  poolAddress(): PublicKey {
    return DarkProtocolClient.poolAddress(this.programId);
  }

  vaultAddress(): PublicKey {
    return DarkProtocolClient.vaultAddress(this.programId);
  }

  // ── Reads ───────────────────────────────────────────────────────────

  /** Fetch the single Pool account (replaces getProtocolState + getMerkleTree). */
  async getPool(): Promise<PoolState> {
    return (await (this.program.account as any).pool.fetch(this.poolAddress())) as unknown as PoolState;
  }

  // ── Instruction builders ────────────────────────────────────────────
  // These build instructions only; signing/sending stays with the caller
  // (wallet / createSmartTx), exactly as the rest of this SDK is shaped.

  /** initialize() — create the Pool + vault PDAs. Signer becomes the
   *  recorded authority (which has no fund-moving power in v1). */
  async initializePool(authority: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .initialize()
      .accountsPartial({
        pool: this.poolAddress(),
        vault: this.vaultAddress(),
        authority,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /** shield(amount, cm) → program `deposit`. Pulls SOL into the vault and
   *  inserts the deposit-bound leaf Poseidon(cm, amount) on-chain. */
  async shield(depositor: PublicKey, params: ShieldParams): Promise<TransactionInstruction> {
    if (params.cm.length !== 32) throw new Error('cm must be a 32-byte field element');
    return this.program.methods
      .deposit(new BN(params.amount.toString()), Array.from(params.cm))
      .accountsPartial({
        pool: this.poolAddress(),
        vault: this.vaultAddress(),
        depositor,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /** unshield({proof, root, nf, amount, recipient, feePayer}) → program
   *  `withdraw`. The program derives the proof's recipient input from the
   *  recipient account itself; the fee payer only funds the marker's rent
   *  and may be any relayer. */
  async unshield(params: UnshieldParams): Promise<TransactionInstruction> {
    if (params.proof.length !== 256) throw new Error('proof must be 256 bytes (A 64 ‖ B 128 ‖ C 64)');
    if (params.root.length !== 32) throw new Error('root must be 32 bytes');
    if (params.nf.length !== 32) throw new Error('nf must be 32 bytes');
    return this.program.methods
      .withdraw(
        Array.from(params.proof),
        Array.from(params.root),
        Array.from(params.nf),
        new BN(params.amount.toString())
      )
      .accountsPartial({
        pool: this.poolAddress(),
        vault: this.vaultAddress(),
        nullifierMarker: DarkProtocolClient.nullifierMarkerAddress(this.programId, params.nf),
        recipient: params.recipient,
        feePayer: params.feePayer,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Create smart transaction with Helius
   */
  async createSmartTx(params: {
    instructions: any[];
    signers: Keypair[];
    feePayer?: PublicKey;
  }) {
    const transaction = new Transaction();
    transaction.add(...params.instructions);
    transaction.feePayer = params.feePayer ?? params.signers[0]?.publicKey;

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.config.commitment ?? 'confirmed');
    transaction.recentBlockhash = blockhash;
    if (params.signers.length > 0) {
      transaction.partialSign(...params.signers);
    }

    return {
      transaction,
      blockhash,
      lastValidBlockHeight,
      provider: this.config.heliusApiKey ? 'helius-rpc' : 'solana-rpc',
    };
  }

  async verifyPrivatePaymentAnchor(receipt: PrivatePaymentReceipt): Promise<DarkIntentVerificationResult> {
    const signature = receipt.solanaAnchor?.signature;
    if (!signature) {
      return {
        ok: false,
        mismatches: [],
        signature: '',
        reason: 'Receipt does not have a Solana anchor signature',
      };
    }

    const verificationCommitment = this.config.commitment === 'finalized' ? 'finalized' : 'confirmed';
    const transaction = await this.connection.getParsedTransaction(signature, {
      commitment: verificationCommitment,
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return {
        ok: false,
        mismatches: [],
        signature,
        reason: 'Transaction was not found on the configured Solana RPC endpoint',
      };
    }

    if (transaction.meta?.err) {
      return {
        ok: false,
        mismatches: [],
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        reason: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
      };
    }

    for (const instruction of transaction.transaction.message.instructions) {
      const memo = readDarkMemoInstructionText(instruction);
      if (!memo) continue;

      const payload = decodeDarkIntentMemo(memo);
      if (!payload || payload.action !== 'private_payment') continue;

      const expectedPayer = receipt.solanaAnchor?.payer;
      const verification = verifyPrivatePaymentIntentPayload(payload, receipt, expectedPayer);
      return {
        ...verification,
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        payer: payload.payer,
        payload,
        reason: verification.ok ? undefined : 'Memo intent payload does not match receipt',
      };
    }

    return {
      ok: false,
      mismatches: [],
      signature,
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      reason: 'No matching ZOLana private-payment Memo intent found in transaction',
    };
  }
}
