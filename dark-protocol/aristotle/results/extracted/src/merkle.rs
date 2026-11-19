//! Incremental Merkle tree (frontier) over circomlib Poseidon, depth 20,
//! plus the pool's root-history ring. Pure state-machine logic — no Anchor
//! account types — so the unit tests exercise exactly the code the program
//! runs on-chain.
//!
//! Definitions (shared contract with the ZK track):
//! - leaf = the deposit-bound leaf `Poseidon(cm, amount)` (re-audit
//!   NEW-1), computed by the deposit handler and inserted at
//!   `next_leaf_index` (0-based). This module is leaf-agnostic: it stores
//!   whatever 32-byte leaf the handler hands it.
//! - node = `Poseidon(left, right)` (2-input circomlib Poseidon, BN254).
//! - empty-subtree roots ("zeros"): `z[0] = 0`, `z[i+1] = Poseidon(z[i], z[i])`.
//! - the root of the empty tree is `z[DEPTH]`.
//!
//! Frontier invariant: `frontier[level]` holds the root of the most recent
//! *complete* subtree of height `level` that is waiting for a right sibling
//! (the standard Tornado/Semaphore frontier). Inserting leaf `n` walks the
//! bits of `n` from LSB upward: at an even index the running node is a left
//! child (stash it in the frontier, pair it with the zero of that level); at
//! an odd index it is a right child (pair it with the stashed frontier node).

use anchor_lang::prelude::*;

use crate::errors::DarkError;
use crate::poseidon::poseidon2;

pub const TREE_DEPTH: usize = 20;
pub const ROOT_HISTORY_SIZE: usize = 32;
pub const MAX_LEAVES: u64 = 1 << TREE_DEPTH;

/// The full zero chain `z[0..=depth]`.
///
/// For `depth <= 20` the values come from the constant table in
/// `crate::zero_chain` — the same values the defining recurrence
/// produces, generated mechanically from this crate's own `poseidon2`
/// and pinned bit-for-bit by
/// `tests::zero_chain_table_matches_computed_chain`. (The chain is
/// prefix-consistent: `z[i]` does not depend on `depth`, so the
/// depth-20 table serves every smaller depth.) Depths past the table
/// — never used on-chain, `TREE_DEPTH` is 20 — extend from `z[20]` by
/// the recurrence itself.
///
/// This lookup replaces an on-chain recomputation that cost `depth`
/// Poseidon hashes per call and, paid twice by `initialize` on top of
/// its fold, pushed that instruction past the 1.4M CU cap (W5-NEW-1).
pub fn zero_chain(depth: usize) -> Result<Vec<[u8; 32]>> {
    let table = crate::zero_chain::zero_chain_20();
    let take = (depth + 1).min(table.len());
    let mut zeros: Vec<[u8; 32]> = table[..take].to_vec();
    while zeros.len() <= depth {
        let z = zeros[zeros.len() - 1];
        zeros.push(poseidon2(&z, &z)?);
    }
    Ok(zeros)
}

/// Parent of two height-`level` nodes, given the zero chain.
///
/// Strict constant-equivalence short-circuit: if both children are
/// exactly the level's zero value, the parent is by definition the
/// next zero in the chain (`z[level + 1] = Poseidon(z[level],
/// z[level])`), so the table value is the identical result with no
/// hash evaluated. The check is byte-exact against the constants, so
/// it can only fire on the constant pair itself — never on a computed
/// value that merely resembles an empty subtree root. This is what
/// makes the empty tree's root (at `initialize`) cost zero hashes:
/// every fold level combines the pair `(z[level], z[level])`.
fn combine(level: usize, zeros: &[[u8; 32]], left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32]> {
    if *left == zeros[level] && *right == zeros[level] {
        Ok(zeros[level + 1])
    } else {
        poseidon2(left, right)
    }
}

/// Root of the completely empty tree of the given depth (`z[depth]`).
pub fn empty_root(depth: usize) -> Result<[u8; 32]> {
    Ok(zero_chain(depth)?[depth])
}

/// A frontier for a tree of `DEPTH` levels, generic so tests can run small
/// depths against an independent reference implementation.
#[derive(Clone, Debug, PartialEq)]
pub struct Frontier<const DEPTH: usize> {
    pub filled: [[u8; 32]; DEPTH],
    pub next_leaf_index: u64,
}

impl<const DEPTH: usize> Frontier<DEPTH> {
    /// A fresh frontier: every level pre-filled with that level's zero,
    /// matching the empty tree.
    pub fn new() -> Result<Self> {
        let zeros = zero_chain(DEPTH)?;
        let mut filled = [[0u8; 32]; DEPTH];
        filled.copy_from_slice(&zeros[..DEPTH]);
        Ok(Self {
            filled,
            next_leaf_index: 0,
        })
    }

    /// Current root: fold the frontier with the zero chain at the current
    /// leaf index. For every non-full state this equals the value the last
    /// `insert` returned. A *full* frontier no longer determines the root
    /// (the final insert's running node is never stored), so this fails
    /// closed with `TreeFull` there — callers must use the root returned by
    /// the last `insert`, which is exactly what the Pool account stores as
    /// `current_root`. The program itself only calls this at initialize
    /// time, on the empty tree.
    pub fn root(&self) -> Result<[u8; 32]> {
        require!(
            self.next_leaf_index < (1u64 << DEPTH),
            DarkError::TreeFull
        );
        let zeros = zero_chain(DEPTH)?;
        // Root of the tree containing leaves [0, next_leaf_index): fold the
        // frontier subtrees and empty space together from the leaf level up,
        // starting from the empty leaf at the next insertion position and
        // combining per the bits of next_leaf_index.
        let mut current = zeros[0];
        let mut idx = self.next_leaf_index;
        for level in 0..DEPTH {
            current = if idx % 2 == 1 {
                combine(level, &zeros, &self.filled[level], &current)?
            } else {
                combine(level, &zeros, &current, &zeros[level])?
            };
            idx /= 2;
        }
        Ok(current)
    }

    /// Insert `leaf` at `next_leaf_index` and return the new root.
    pub fn insert(&mut self, leaf: [u8; 32]) -> Result<[u8; 32]> {
        require!(
            self.next_leaf_index < (1u64 << DEPTH),
            DarkError::TreeFull
        );
        let zeros = zero_chain(DEPTH)?;
        let mut current = leaf;
        let mut idx = self.next_leaf_index;
        for level in 0..DEPTH {
            if idx % 2 == 0 {
                self.filled[level] = current;
                current = combine(level, &zeros, &current, &zeros[level])?;
            } else {
                current = combine(level, &zeros, &self.filled[level], &current)?;
            }
            idx /= 2;
        }
        self.next_leaf_index = self
            .next_leaf_index
            .checked_add(1)
            .ok_or_else(|| error!(DarkError::ArithmeticOverflow))?;
        Ok(current)
    }
}

/// Root-history ring: the last `SIZE` roots, oldest evicted first.
/// A withdraw proof may anchor to any root still in the ring (the standard
/// pool design — the prover's note may predate the latest deposit).
#[derive(Clone, Debug, PartialEq)]
pub struct RootHistory<const SIZE: usize> {
    pub roots: [[u8; 32]; SIZE],
    /// Next slot to overwrite.
    pub next: u8,
    /// Number of valid entries, saturating at SIZE.
    pub len: u8,
}

impl<const SIZE: usize> RootHistory<SIZE> {
    pub fn new(initial_root: [u8; 32]) -> Self {
        let mut h = Self {
            roots: [[0u8; 32]; SIZE],
            next: 0,
            len: 0,
        };
        h.push(initial_root);
        h
    }

    pub fn push(&mut self, root: [u8; 32]) {
        self.roots[self.next as usize] = root;
        self.next = ((self.next as usize + 1) % SIZE) as u8;
        if (self.len as usize) < SIZE {
            self.len += 1;
        }
    }

    pub fn contains(&self, root: &[u8; 32]) -> bool {
        // The zero root is never a valid anchor (it is not a tree root).
        if *root == [0u8; 32] {
            return false;
        }
        let n = (self.len as usize).min(SIZE);
        self.roots[..n].iter().any(|r| r == root)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Independent reference: sparse Merkle root computed by divide and
    /// conquer directly from the set of inserted leaves — no frontier state,
    /// no shared code path with `Frontier::insert` beyond `poseidon2`.
    fn reference_root(leaves: &[[u8; 32]], depth: usize) -> [u8; 32] {
        fn rec(leaves: &[[u8; 32]], lo: u64, depth: usize, zeros: &[[u8; 32]]) -> [u8; 32] {
            // Leaves are inserted sequentially from index 0, so a subtree
            // whose range starts at or beyond the leaf count is empty.
            if lo >= leaves.len() as u64 {
                return zeros[depth];
            }
            if depth == 0 {
                return leaves
                    .get(lo as usize)
                    .copied()
                    .unwrap_or([0u8; 32]);
            }
            let half = 1u64 << (depth - 1);
            let left = rec(leaves, lo, depth - 1, zeros);
            let right = rec(leaves, lo + half, depth - 1, zeros);
            if left == zeros[depth - 1] && right == zeros[depth - 1] {
                return zeros[depth];
            }
            poseidon2(&left, &right).unwrap()
        }
        let zeros = zero_chain(depth).unwrap();
        rec(leaves, 0, depth, &zeros)
    }

    fn sample_leaf(i: u64) -> [u8; 32] {
        // Deterministic pseudo-random canonical field elements.
        let mut x = [0u8; 32];
        x[24..].copy_from_slice(&(0x9e3779b97f4a7c15u64 ^ i.wrapping_mul(0x2545f4914f6cdd1d)).to_be_bytes());
        x[0] = 0x10; // keep well below the modulus
        x
    }

    #[test]
    fn empty_tree_root_is_top_of_zero_chain() {
        let f = Frontier::<20>::new().unwrap();
        assert_eq!(f.root().unwrap(), empty_root(20).unwrap());
        assert_eq!(f.next_leaf_index, 0);
    }

    /// W5-NEW-1 fix, part 1: the constant table in `crate::zero_chain`
    /// must be the computed zero chain, bit-for-bit. The chain is
    /// re-derived here from scratch — start from 0 and iterate
    /// `poseidon2(z, z)` — without touching `zero_chain()` or the
    /// table accessor's own conversion path beyond the final compare,
    /// so a wrong table (or a wrong limb order in it) fails here.
    #[test]
    fn zero_chain_table_matches_computed_chain() {
        let table = crate::zero_chain::zero_chain_20();
        let via_fn = zero_chain(20).unwrap();
        let mut z = [0u8; 32];
        for i in 0..=20usize {
            assert_eq!(table[i], z, "table z[{i}] != computed zero chain");
            assert_eq!(via_fn[i], z, "zero_chain() z[{i}] != computed zero chain");
            if i < 20 {
                z = poseidon2(&z, &z).unwrap();
            }
        }
        // Smaller depths are prefixes of the same chain.
        let z4 = zero_chain(4).unwrap();
        assert_eq!(&z4[..], &table[..5]);
    }

    /// W5-NEW-1 fix, part 2: the optimized frontier (constant table +
    /// `combine` short-circuit) must produce bit-identical roots to
    /// the pre-fix computation path across a multi-deposit sequence.
    /// The reference below is that path in substance: zeros derived by
    /// raw `poseidon2` iteration (never the table), and every internal
    /// node over the leaf range computed by hashing its children
    /// (never the short-circuit, never frontier state).
    #[test]
    fn frontier_equivalence_multi_deposit_full_hash_reference() {
        fn raw_zeros(depth: usize) -> Vec<[u8; 32]> {
            let mut zeros = vec![[0u8; 32]];
            for i in 0..depth {
                let z = zeros[i];
                zeros.push(poseidon2(&z, &z).unwrap());
            }
            zeros
        }
        fn full_hash_root(leaves: &[[u8; 32]], lo: u64, depth: usize, zeros: &[[u8; 32]]) -> [u8; 32] {
            if lo >= leaves.len() as u64 {
                return zeros[depth];
            }
            if depth == 0 {
                return leaves[lo as usize];
            }
            let half = 1u64 << (depth - 1);
            let left = full_hash_root(leaves, lo, depth - 1, zeros);
            let right = full_hash_root(leaves, lo + half, depth - 1, zeros);
            poseidon2(&left, &right).unwrap()
        }
        const D: usize = 20;
        let zeros = raw_zeros(D);
        let mut frontier = Frontier::<D>::new().unwrap();
        assert_eq!(
            frontier.root().unwrap(),
            full_hash_root(&[], 0, D, &zeros),
            "empty root mismatch"
        );
        let mut leaves: Vec<[u8; 32]> = Vec::new();
        for i in 0..40u64 {
            let leaf = sample_leaf(i * 13 + 5);
            let new_root = frontier.insert(leaf).unwrap();
            leaves.push(leaf);
            let expected = full_hash_root(&leaves, 0, D, &zeros);
            assert_eq!(new_root, expected, "insert root mismatch after insert {i}");
            assert_eq!(
                frontier.root().unwrap(),
                expected,
                "frontier root mismatch after insert {i}"
            );
        }
    }

    #[test]
    fn frontier_matches_reference_small_depth() {
        const D: usize = 4;
        let mut frontier = Frontier::<D>::new().unwrap();
        let mut leaves: Vec<[u8; 32]> = Vec::new();
        assert_eq!(frontier.root().unwrap(), reference_root(&leaves, D));
        for i in 0..(1u64 << D) {
            let leaf = sample_leaf(i);
            let new_root = frontier.insert(leaf).unwrap();
            leaves.push(leaf);
            let expected = reference_root(&leaves, D);
            assert_eq!(new_root, expected, "root mismatch after insert {i}");
            if i + 1 < (1u64 << D) {
                assert_eq!(frontier.root().unwrap(), expected);
            }
        }
        // Tree is now full: further inserts fail, and the frontier alone
        // no longer determines the root (see Frontier::root docs).
        assert!(frontier.insert(sample_leaf(99)).is_err());
        assert!(frontier.root().is_err());
    }

    #[test]
    fn frontier_matches_reference_production_depth() {
        const D: usize = 20;
        let mut frontier = Frontier::<D>::new().unwrap();
        let mut leaves: Vec<[u8; 32]> = Vec::new();
        for i in 0..64u64 {
            let leaf = sample_leaf(i * 7 + 1);
            let new_root = frontier.insert(leaf).unwrap();
            leaves.push(leaf);
            assert_eq!(
                new_root,
                reference_root(&leaves, D),
                "root mismatch after insert {i}"
            );
        }
    }

    #[test]
    fn root_history_ring_evicts_oldest() {
        let mut h = RootHistory::<32>::new([1u8; 32]);
        assert!(h.contains(&[1u8; 32]));
        assert!(!h.contains(&[2u8; 32]));
        assert!(!h.contains(&[0u8; 32])); // zero root never valid
        for i in 2..=33u8 {
            h.push([i; 32]);
        }
        // 33 pushes after the initial root: initial root (1) evicted, 2..=33 present.
        assert!(!h.contains(&[1u8; 32]));
        assert!(h.contains(&[2u8; 32]));
        assert!(h.contains(&[33u8; 32]));
        assert_eq!(h.len, 32);
    }

    #[test]
    fn root_history_small_ring() {
        let mut h = RootHistory::<4>::new([9u8; 32]);
        h.push([8u8; 32]);
        h.push([7u8; 32]);
        assert!(h.contains(&[9u8; 32]));
        h.push([6u8; 32]);
        h.push([5u8; 32]);
        assert!(!h.contains(&[9u8; 32]));
        assert!(h.contains(&[5u8; 32]));
        assert_eq!(h.len, 4);
    }
}
