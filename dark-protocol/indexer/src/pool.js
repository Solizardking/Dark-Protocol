// Off-chain pool state rebuilt purely from the program's events.
//
// The tree holds the deposit-bound leaves exactly as the program inserted
// them (the `leaf` field of NoteDeposited = Poseidon(cm, amount), NEW-1).
// Roots are recomputed with @dark-protocol/client-lib's Poseidon tree —
// the same implementation clients use — and cross-checked against each
// event's `newRoot`: a mismatch means the event stream is not the pool's
// (wrong program, missed deposit, corrupted feed) and the indexer must
// halt rather than serve paths from a tree the chain would reject.

import { computeRoot, getMerklePath, verifyMerklePath, bytesToField, fieldToBytes } from '@dark-protocol/client-lib';

export class PoolTree {
  constructor() {
    /** @type {bigint[]} bound leaves by leaf index */
    this.leaves = [];
    /** @type {Set<string>} spent nullifiers, hex of the 32-byte field encoding */
    this.spentNullifiers = new Set();
    this.initialized = false;
    this.authority = null;
    this.vkIsPlaceholder = null;
  }

  static bytesToBig(buf) {
    return bytesToField(new Uint8Array(buf));
  }

  static bigToBytes(x) {
    return fieldToBytes(x);
  }

  /** Apply one decoded event. Returns the root after a deposit. Throws on
   *  ordering violations or a root mismatch (fail-closed). */
  async apply(event) {
    switch (event.type) {
      case 'ProtocolInitialized': {
        if (this.initialized) throw new Error('PoolTree: duplicate ProtocolInitialized');
        const emptyRoot = await computeRoot([]);
        if (PoolTree.bytesToBig(event.initialRoot) !== emptyRoot) {
          throw new Error('PoolTree: initial root is not the empty-tree root');
        }
        this.initialized = true;
        this.authority = event.authority;
        this.vkIsPlaceholder = event.vkIsPlaceholder;
        return emptyRoot;
      }
      case 'NoteDeposited': {
        if (!this.initialized) throw new Error('PoolTree: deposit before initialize');
        const idx = Number(event.leafIndex);
        if (idx !== this.leaves.length) {
          throw new Error(`PoolTree: deposit leaf_index ${idx} != next index ${this.leaves.length} (missed a deposit?)`);
        }
        this.leaves.push(PoolTree.bytesToBig(event.leaf));
        const root = await computeRoot(this.leaves);
        if (root !== PoolTree.bytesToBig(event.newRoot)) {
          throw new Error('PoolTree: rebuilt root != event newRoot — event stream does not describe this pool');
        }
        return root;
      }
      case 'NoteWithdrawn': {
        if (!this.initialized) throw new Error('PoolTree: withdraw before initialize');
        this.spentNullifiers.add(Buffer.from(event.nf).toString('hex'));
        return this.currentRoot();
      }
      default:
        throw new Error(`PoolTree: unknown event ${event.type}`);
    }
  }

  async currentRoot() {
    return computeRoot(this.leaves);
  }

  /** Merkle path for the leaf at `index`, in the exact shape the circuit consumes. */
  async pathFor(index) {
    if (index < 0 || index >= this.leaves.length) throw new Error(`PoolTree: no leaf at index ${index}`);
    return getMerklePath(this.leaves, index);
  }

  async verifyPath(index) {
    const path = await this.pathFor(index);
    return verifyMerklePath(this.leaves[index], path);
  }

  isSpent(nfBytes) {
    return this.spentNullifiers.has(Buffer.from(nfBytes).toString('hex'));
  }

  toJSON() {
    return {
      leaves: this.leaves.map((x) => x.toString()),
      spentNullifiers: [...this.spentNullifiers],
      initialized: this.initialized,
      vkIsPlaceholder: this.vkIsPlaceholder,
    };
  }

  static fromJSON(json) {
    const tree = new PoolTree();
    tree.leaves = (json.leaves ?? []).map((x) => BigInt(x));
    tree.spentNullifiers = new Set(json.spentNullifiers ?? []);
    tree.initialized = !!json.initialized;
    tree.vkIsPlaceholder = json.vkIsPlaceholder ?? null;
    return tree;
  }
}
