/**
 * Dark Protocol — On-Chain Shielded Note Pool (v1)
 *
 * Commitment-based privacy pool with Sapling-compatible encrypted notes.
 * Notes are encrypted with ChaCha20-Poly1305 (client-side, Sapling spec).
 * Encrypted ciphertexts are stored on-chain; the client SDK decrypts with IVK.
 *
 * Instructions:
 *   initialize        — bootstrap ProtocolState PDA + pool vault
 *   deposit           — shield SOL + store encrypted note
 *   withdraw          — reveal nullifier, redeem SOL (note owner must sign)
 *   shielded_transfer — spend one note, create two new notes (payment + change)
 *                       (note owner must sign; each output names its owner)
 *   post_ciphertext   — attach the encrypted note to a transfer output
 *                       (the transfer's sender, once per note)
 *
 * Design notes (v1):
 *   - Fixed-size ciphertext arrays (no heap allocation — smaller binary)
 *   - Merkle root is maintained off-chain by the SDK (no sha2 dependency)
 *   - Nullifier uniqueness enforced via PDA collision
 *   - Spend authorization: every note records an `owner` (the spend
 *     authority). `withdraw` and `shielded_transfer` require that owner's
 *     signature, so a third party cannot redeem someone else's unspent note.
 *     v1 does not verify a zero-knowledge proof; ownership is public.
 *   - Two 580-byte Sapling ciphertexts cannot fit in one Solana transaction
 *     (1232-byte limit), so `shielded_transfer` creates the output notes and
 *     each output's ciphertext is attached by a follow-up `post_ciphertext`.
 */

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("E8zL7h9qHjC7sMf2WCYhdqS5iLkYhPJ9yAhTfevo74jm");

// ─── constants ────────────────────────────────────────────────────────────────

pub const ENC_NOTE_SIZE: usize  = 580;   // Sapling enc_ciphertext
pub const OUT_CIPHER_SIZE: usize = 80;   // Sapling out_ciphertext

// ─── program ──────────────────────────────────────────────────────────────────

#[program]
pub mod dark_protocol_program {
    use super::*;

    // ── initialize ──────────────────────────────────────────────────────────

    /// Bootstrap the global ProtocolState PDA.
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let state         = &mut ctx.accounts.protocol_state;
        state.authority   = authority;
        state.note_count  = 0;
        state.bump        = ctx.bumps.protocol_state;
        state.vault_bump  = ctx.bumps.pool_vault;
        emit!(ProtocolInitialized { authority });
        Ok(())
    }

    // ── deposit ─────────────────────────────────────────────────────────────

    /// Shield SOL into the private pool and create an on-chain encrypted note.
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        commitment: [u8; 32],
        enc_ciphertext: [u8; ENC_NOTE_SIZE],
        out_ciphertext: [u8; OUT_CIPHER_SIZE],
        ephemeral_key: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, DarkError::ZeroAmount);

        // Transfer SOL: depositor → pool vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to:   ctx.accounts.pool_vault.to_account_info(),
            },
        );
        transfer(cpi_ctx, amount)?;

        let state      = &mut ctx.accounts.protocol_state;
        let note_index = state.note_count;
        state.note_count = state.note_count
            .checked_add(1)
            .ok_or(DarkError::NoteOverflow)?;

        let note             = &mut ctx.accounts.shielded_note;
        note.commitment      = commitment;
        note.enc_ciphertext  = enc_ciphertext;
        note.out_ciphertext  = out_ciphertext;
        note.ephemeral_key   = ephemeral_key;
        note.amount          = amount;
        note.spent           = false;
        note.note_index      = note_index;
        note.slot            = Clock::get()?.slot;
        note.owner           = ctx.accounts.depositor.key();
        note.ciphertext_authority = ctx.accounts.depositor.key();
        note.ciphertext_posted    = true;
        note.bump            = ctx.bumps.shielded_note;

        emit!(NoteDeposited { commitment, amount, note_index, slot: note.slot });
        Ok(())
    }

    // ── withdraw ────────────────────────────────────────────────────────────

    /// Withdraw SOL from a note. Only the note's `owner` may sign; the SOL can
    /// go to any `recipient` account.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        nullifier: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        let note = &mut ctx.accounts.shielded_note;
        require!(!note.spent, DarkError::NoteAlreadySpent);
        require!(note.amount == amount, DarkError::AmountMismatch);
        note.spent = true;

        let null_record       = &mut ctx.accounts.nullifier_record;
        null_record.nullifier = nullifier;
        null_record.slot      = Clock::get()?.slot;
        null_record.bump      = ctx.bumps.nullifier_record;

        // Transfer SOL: pool vault → recipient (PDA signs)
        let vault_bump_val   = ctx.accounts.protocol_state.vault_bump;
        let protocol_key     = ctx.accounts.protocol_state.key();
        let vault_bump_arr   = [vault_bump_val];
        let seeds: &[&[u8]]  = &[b"pool_vault", protocol_key.as_ref(), &vault_bump_arr];
        let signer_seeds     = &[seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to:   ctx.accounts.recipient.to_account_info(),
            },
            signer_seeds,
        );
        transfer(cpi_ctx, amount)?;

        emit!(NoteWithdrawn { nullifier, amount, slot: null_record.slot });
        Ok(())
    }

    // ── shielded_transfer ───────────────────────────────────────────────────

    /// Spend one input note and create two output notes (payment + change).
    /// No SOL moves — only note commitments change.
    pub fn shielded_transfer(
        ctx: Context<ShieldedTransfer>,
        input_nullifier: [u8; 32],
        output_commitment_1: [u8; 32],
        output_commitment_2: [u8; 32],
        amount_1: u64,
        amount_2: u64,
        owner_1: Pubkey,
        owner_2: Pubkey,
    ) -> Result<()> {
        let input_note = &mut ctx.accounts.input_note;
        require!(!input_note.spent, DarkError::NoteAlreadySpent);
        require!(
            input_note.amount == amount_1.checked_add(amount_2).ok_or(DarkError::NoteOverflow)?,
            DarkError::AmountMismatch
        );
        input_note.spent = true;

        let null_record       = &mut ctx.accounts.nullifier_record;
        null_record.nullifier = input_nullifier;
        null_record.slot      = Clock::get()?.slot;
        null_record.bump      = ctx.bumps.nullifier_record;

        let state  = &mut ctx.accounts.protocol_state;
        let slot   = Clock::get()?.slot;
        let sender = ctx.accounts.sender.key();

        let note1             = &mut ctx.accounts.output_note_1;
        note1.commitment      = output_commitment_1;
        // enc/out ciphertext and ephemeral key stay zeroed (fresh `init`) until post_ciphertext.
        note1.amount          = amount_1;
        note1.spent           = false;
        note1.note_index      = state.note_count;
        note1.slot            = slot;
        note1.owner           = owner_1;
        note1.ciphertext_authority = sender;
        note1.ciphertext_posted    = false;
        note1.bump            = ctx.bumps.output_note_1;
        state.note_count = state.note_count.checked_add(1).ok_or(DarkError::NoteOverflow)?;

        let note2             = &mut ctx.accounts.output_note_2;
        note2.commitment      = output_commitment_2;
        // enc/out ciphertext and ephemeral key stay zeroed (fresh `init`) until post_ciphertext.
        note2.amount          = amount_2;
        note2.spent           = false;
        note2.note_index      = state.note_count;
        note2.slot            = slot;
        note2.owner           = owner_2;
        note2.ciphertext_authority = sender;
        note2.ciphertext_posted    = false;
        note2.bump            = ctx.bumps.output_note_2;
        state.note_count = state.note_count.checked_add(1).ok_or(DarkError::NoteOverflow)?;

        emit!(NoteTransferred {
            input_nullifier,
            output_commitment_1,
            output_commitment_2,
            amount_1,
            amount_2,
        });
        Ok(())
    }

    // ── post_ciphertext ─────────────────────────────────────────────────────

    /// Attach the encrypted note payload to an output of `shielded_transfer`.
    /// Only that transfer's sender may post, and only once per note.
    pub fn post_ciphertext(
        ctx: Context<PostCiphertext>,
        enc_ciphertext: [u8; ENC_NOTE_SIZE],
        out_ciphertext: [u8; OUT_CIPHER_SIZE],
        ephemeral_key: [u8; 32],
    ) -> Result<()> {
        let note = &mut ctx.accounts.note;
        require!(!note.ciphertext_posted, DarkError::CiphertextAlreadyPosted);
        note.enc_ciphertext    = enc_ciphertext;
        note.out_ciphertext    = out_ciphertext;
        note.ephemeral_key     = ephemeral_key;
        note.ciphertext_posted = true;
        Ok(())
    }
}

// ─── account structs ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer  = payer,
        space  = ProtocolState::LEN,
        seeds  = [b"protocol"],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    /// CHECK: Native-SOL vault — receives and pays out shielded funds.
    #[account(
        mut,
        seeds = [b"pool_vault", protocol_state.key().as_ref()],
        bump,
    )]
    pub pool_vault: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32])]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer  = depositor,
        space  = ShieldedNote::LEN,
        seeds  = [b"note", commitment.as_ref()],
        bump,
    )]
    pub shielded_note: Box<Account<'info, ShieldedNote>>,

    /// CHECK: SOL vault.
    #[account(
        mut,
        seeds = [b"pool_vault", protocol_state.key().as_ref()],
        bump  = protocol_state.vault_bump,
    )]
    pub pool_vault: AccountInfo<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32], amount: u64)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"note", shielded_note.commitment.as_ref()],
        bump  = shielded_note.bump,
        constraint = shielded_note.owner == owner.key() @ DarkError::NotNoteOwner,
    )]
    pub shielded_note: Box<Account<'info, ShieldedNote>>,

    #[account(
        init,
        payer  = owner,
        space  = NullifierRecord::LEN,
        seeds  = [b"nullifier", nullifier.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    /// CHECK: SOL vault.
    #[account(
        mut,
        seeds = [b"pool_vault", protocol_state.key().as_ref()],
        bump  = protocol_state.vault_bump,
    )]
    pub pool_vault: AccountInfo<'info>,

    /// The note's spend authority. Must sign and pays for the nullifier record.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Receives the withdrawn SOL. Any system account; does not need to sign.
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    input_nullifier: [u8; 32],
    output_commitment_1: [u8; 32],
    output_commitment_2: [u8; 32]
)]
pub struct ShieldedTransfer<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"note", input_note.commitment.as_ref()],
        bump  = input_note.bump,
        constraint = input_note.owner == sender.key() @ DarkError::NotNoteOwner,
    )]
    pub input_note: Box<Account<'info, ShieldedNote>>,

    #[account(
        init,
        payer  = sender,
        space  = NullifierRecord::LEN,
        seeds  = [b"nullifier", input_nullifier.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    #[account(
        init,
        payer  = sender,
        space  = ShieldedNote::LEN,
        seeds  = [b"note", output_commitment_1.as_ref()],
        bump,
    )]
    pub output_note_1: Box<Account<'info, ShieldedNote>>,

    #[account(
        init,
        payer  = sender,
        space  = ShieldedNote::LEN,
        seeds  = [b"note", output_commitment_2.as_ref()],
        bump,
    )]
    pub output_note_2: Box<Account<'info, ShieldedNote>>,

    #[account(mut)]
    pub sender: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PostCiphertext<'info> {
    #[account(
        mut,
        seeds = [b"note", note.commitment.as_ref()],
        bump  = note.bump,
        constraint = note.ciphertext_authority == authority.key() @ DarkError::NotCiphertextAuthority,
    )]
    pub note: Box<Account<'info, ShieldedNote>>,

    pub authority: Signer<'info>,
}

// ─── state ────────────────────────────────────────────────────────────────────

#[account]
pub struct ProtocolState {
    pub authority:   Pubkey,     // 32
    pub note_count:  u64,        // 8
    pub bump:        u8,         // 1
    pub vault_bump:  u8,         // 1
}
impl ProtocolState {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 1; // 50
}

#[account]
pub struct ShieldedNote {
    pub commitment:    [u8; 32],              // 32
    pub enc_ciphertext: [u8; ENC_NOTE_SIZE],  // 580
    pub out_ciphertext: [u8; OUT_CIPHER_SIZE],// 80
    pub ephemeral_key: [u8; 32],              // 32
    pub amount:        u64,                   // 8
    pub spent:         bool,                  // 1
    pub note_index:    u64,                   // 8
    pub slot:          u64,                   // 8
    /// Spend authority: the only key that may withdraw or transfer this note.
    pub owner:         Pubkey,                // 32
    pub bump:          u8,                    // 1
    /// Who may attach the ciphertext (the depositor, or the transfer sender).
    pub ciphertext_authority: Pubkey,         // 32
    /// Whether enc/out ciphertext and ephemeral key have been written.
    pub ciphertext_posted: bool,              // 1
}
impl ShieldedNote {
    pub const LEN: usize = 8    // discriminator
        + 32                    // commitment
        + ENC_NOTE_SIZE         // enc_ciphertext
        + OUT_CIPHER_SIZE       // out_ciphertext
        + 32                    // ephemeral_key
        + 8                     // amount
        + 1                     // spent
        + 8                     // note_index
        + 8                     // slot
        + 32                    // owner
        + 1                     // bump
        + 32                    // ciphertext_authority
        + 1;                    // ciphertext_posted
    // Total: 8+32+580+80+32+8+1+8+8+32+1+32+1 = 823
}

#[account]
pub struct NullifierRecord {
    pub nullifier: [u8; 32],  // 32
    pub slot:      u64,       // 8
    pub bump:      u8,        // 1
}
impl NullifierRecord {
    pub const LEN: usize = 8 + 32 + 8 + 1; // 49
}

// ─── events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProtocolInitialized { pub authority: Pubkey }

#[event]
pub struct NoteDeposited {
    pub commitment: [u8; 32],
    pub amount:     u64,
    pub note_index: u64,
    pub slot:       u64,
}

#[event]
pub struct NoteWithdrawn {
    pub nullifier: [u8; 32],
    pub amount:    u64,
    pub slot:      u64,
}

#[event]
pub struct NoteTransferred {
    pub input_nullifier:     [u8; 32],
    pub output_commitment_1: [u8; 32],
    pub output_commitment_2: [u8; 32],
    pub amount_1:            u64,
    pub amount_2:            u64,
}

// ─── errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum DarkError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Note has already been spent")]
    NoteAlreadySpent,
    #[msg("Amount does not match note value")]
    AmountMismatch,
    #[msg("Note count overflow")]
    NoteOverflow,
    #[msg("Signer is not the owner of this note")]
    NotNoteOwner,
    #[msg("Note ciphertext has already been posted")]
    CiphertextAlreadyPosted,
    #[msg("Signer may not post this note's ciphertext")]
    NotCiphertextAuthority,
}
