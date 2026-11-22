# W8-D — Fees design (follow-on work order, NOT part of the core transplant)

**Status: design only. The merged v1 charges no fees and has no
min/max deposit config. The legacy `PrivacyPool` fee parameters
(fee_bps, min/max) are kept as a design input (TRANSPLANT-SPEC §5.3),
not as code — that account was never even initialized by the legacy
program.**

## Constraints from the contract

- A withdraw proof binds `[root, nf, recipient, amount]`, where
  `amount` is the note's full value. The recipient field is computed by
  the program from the payee account. Any fee must therefore be taken
  **by the program, after verification, out of the verified amount** —
  the circuit never sees the fee, and the payee's received amount is
  `amount - fee`. UX and SDK copy must state the net amount before the
  user proves, because the proof itself is for the gross.
- Deposit-side fees break the NEW-1 symmetry if taken from the deposit
  (leaf binds the deposited amount; a skimmed deposit would need the
  leaf bound to the net, and the depositor's note is over the gross).
  **No deposit fee in this design.** Deposit min/max, if wanted, are
  plain handler checks (`min_deposit <= amount <= max_deposit`) that
  reject, never skim.

## Design (withdraw-side fee)

- Pool gains `fee_bps: u16` (cap 10_000) and a `fee_vault` PDA
  (lamport-only, like the vault). Both are set at `initialize` in v1 of
  this work order — changing them later is an admin instruction and a
  separately audited track (the v1 program's authority deliberately has
  no powers; do not smuggle one in here).
- Withdraw handler, after step (3) verification and before payout:
  `fee = amount * fee_bps / 10_000` (floor, checked arithmetic);
  transfer `amount - fee` to recipient, `fee` to fee_vault. Ledger:
  `total_withdrawn += amount` (gross — the solvency invariant compares
  gross totals; fees are a payout split, not new issuance).
- `NoteWithdrawn` event gains `fee` so the indexer and users can
  reconcile net vs gross from logs alone.
- Edge cases: fee rounding to zero on small amounts (fine, disclose);
  `amount - fee` must stay > 0 for the payout transfer to be meaningful
  (reject `fee_bps = 10_000` at initialize); fee_vault donations cannot
  inflate anything (it is outside the solvency ledger, same doctrine as
  vault donations).

## What this design refuses
- Fees as a config port from the legacy PrivacyPool (its numbers were
  never exercised by any code path).
- Fee changes via the recorded authority without a new instruction +
  audit.
- Any fee on transfers until the transfer circuit (W8-B) defines how
  fees interact with hidden amounts — likely a fixed per-transfer fee
  taken from the input note's value with the remainder conserved, which
  the circuit must see. Do not bolt the withdraw fee onto transfers.
