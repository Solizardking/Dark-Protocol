pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "merkle.circom";

// Withdraw(levels) — Dark DeFi V1 withdraw circuit (full-note spend).
//
// Design contract (shared with the TS client and the on-chain program):
//   Field: BN254 scalar field. Hash: Poseidon (circomlib).
//   sk        = spending key (field element, private)
//   nk        = Poseidon(sk, 0)                          (nullifier key)
//   owner_id  = Poseidon(sk, 1)                          (note owner)
//   note      = { owner_id, value (u64), blinding }
//   cm        = Poseidon(owner_id, value, blinding)      (note commitment)
//   leaf      = Poseidon(cm, value)                      (deposit-bound leaf)
//   nf        = Poseidon(nk, leaf_index)                 (nullifier)
//   Merkle tree: depth 20, 2-input Poseidon nodes (see merkle.circom).
//
// Deposit binding (re-audit finding NEW-1): the tree does NOT hold `cm`
// directly. At deposit the program computes leaf = Poseidon(cm, amount)
// on-chain from the *actual lamports deposited* and inserts that leaf.
// This circuit recomputes the same bound leaf from the note opening and
// proves membership of the bound leaf, with the commitment computed over
// the public `amount` — so a note is spendable only for exactly the value
// that was deposited against its commitment. A commitment crafted over an
// arbitrary V but deposited with fewer lamports has no leaf in the tree
// that any proof can open.
//
// Public inputs (order is part of the contract — Groth16 binds them
// positionally, and the on-chain verifier must supply them in this order):
//   [0] root       — Merkle root the commitment is proven against
//   [1] nf         — nullifier of the spent note
//   [2] recipient  — field element binding the payout destination:
//                    Poseidon(hi128, lo128) of the recipient Solana pubkey,
//                    hi128 = first 16 bytes (big-endian), lo128 = last 16 bytes
//   [3] amount     — payout amount; V1 spends the whole note, so the circuit
//                    forces note value == amount (no change note)
//
// Private inputs: sk, blinding, leafIndex, pathElements[20], pathIndices[20].
//
// Anti-malleability: like Tornado Cash, the public inputs root/nf/recipient
// are additionally squared into the constraint system so a proof cannot be
// re-bound to a congruent-but-different public input (x + p) by a malicious
// prover/verifier pair. `amount` is pinned by its u64 range check instead.
template Withdraw(levels) {
    // ---- public inputs ----
    signal input root;
    signal input nf;
    signal input recipient;
    signal input amount;

    // ---- private inputs ----
    signal input sk;
    signal input blinding;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // nk = Poseidon(sk, 0)
    component nkHash = Poseidon(2);
    nkHash.inputs[0] <== sk;
    nkHash.inputs[1] <== 0;
    signal nk <== nkHash.out;

    // owner_id = Poseidon(sk, 1)
    component ownerHash = Poseidon(2);
    ownerHash.inputs[0] <== sk;
    ownerHash.inputs[1] <== 1;
    signal ownerId <== ownerHash.out;

    // amount must be a canonical u64 (this also binds note value == amount,
    // because the commitment below is computed over `amount` directly).
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;

    // cm = Poseidon(owner_id, value = amount, blinding)
    component cmHash = Poseidon(3);
    cmHash.inputs[0] <== ownerId;
    cmHash.inputs[1] <== amount;
    cmHash.inputs[2] <== blinding;
    signal cm <== cmHash.out;

    // leafIndex must fit the tree depth, and the supplied pathIndices must be
    // exactly its bits (LSB-first) — the path cannot be re-interpreted for a
    // different leaf position.
    component idxBits = Num2Bits(levels);
    idxBits.in <== leafIndex;
    for (var i = 0; i < levels; i++) {
        pathIndices[i] === idxBits.out[i];
    }

    // Deposit-bound leaf: leaf = Poseidon(cm, amount). The program inserts
    // exactly this value at deposit time, computed from the lamports it
    // actually pulled — so membership of the bound leaf proves the note's
    // committed value was fully backed by the deposit (NEW-1).
    component leafHash = Poseidon(2);
    leafHash.inputs[0] <== cm;
    leafHash.inputs[1] <== amount;
    signal leaf <== leafHash.out;

    // Merkle inclusion: the bound leaf must sit at leafIndex under `root`.
    component tree = MerkleInclusion(levels);
    tree.leaf <== leaf;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    tree.root === root;

    // nf = Poseidon(nk, leafIndex)
    component nfHash = Poseidon(2);
    nfHash.inputs[0] <== nk;
    nfHash.inputs[1] <== leafIndex;
    nfHash.out === nf;

    // Anti-malleability squares for the remaining public inputs.
    signal rootSq <== root * root;
    signal nfSq <== nf * nf;
    signal recipientSq <== recipient * recipient;
}

component main {public [root, nf, recipient, amount]} = Withdraw(20);
