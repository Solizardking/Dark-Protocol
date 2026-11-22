// darknote.js — JS side of the Dark DeFi ZK design contract.
// Must stay in lockstep with circuits/withdraw.circom (see README.md).
//
//   Field: BN254 scalar field. Hash: Poseidon (circomlib / circomlibjs).
//   nk       = Poseidon(sk, 0)
//   owner_id = Poseidon(sk, 1)
//   cm       = Poseidon(owner_id, value, blinding)
//   leaf     = Poseidon(cm, amount)   — the deposit-bound leaf the program
//              inserts on-chain (re-audit NEW-1): the tree holds bound
//              leaves, never raw commitments.
//   nf       = Poseidon(nk, leaf_index)
//   Merkle tree: depth 20, 2-input Poseidon nodes,
//     zeros[0] = 0, zeros[i+1] = Poseidon(zeros[i], zeros[i]),
//     path indices LSB-first (pathIndices[0] = lowest bit of leaf index).
//   recipient = Poseidon(hi128, lo128) of the recipient Solana pubkey:
//     hi128 = bytes 0..15 as big-endian integer, lo128 = bytes 16..31.

const { buildPoseidon } = require("circomlibjs");

const TREE_DEPTH = 20;

let _poseidon = null;
let _F = null;

async function initPoseidon() {
  if (_poseidon) return _poseidon;
  _poseidon = await buildPoseidon();
  _F = _poseidon.F;
  return _poseidon;
}

function H(inputs) {
  // Poseidon over field elements (BigInt / number / string), returns BigInt.
  const out = _poseidon(inputs.map((x) => _F.e(BigInt(x))));
  return _F.toObject(out);
}

function deriveNullifierKey(sk) {
  return H([sk, 0]);
}

function deriveOwnerId(sk) {
  return H([sk, 1]);
}

function noteCommitment(ownerId, value, blinding) {
  return H([ownerId, value, blinding]);
}

// The leaf the pool's tree actually holds for a deposit of `amount`
// lamports against commitment `cm`: Poseidon(cm, amount). The on-chain
// program computes this at deposit from the lamports it pulled; off-chain
// tree builders (wallets, the indexer) must insert exactly this value or
// their roots will never match the program's.
function boundLeaf(cm, amount) {
  return H([cm, amount]);
}

function nullifier(nk, leafIndex) {
  return H([nk, leafIndex]);
}

// recipient field element from a 32-byte Solana public key.
function recipientFromPubkey(pubkeyBytes) {
  if (pubkeyBytes.length !== 32) {
    throw new Error("Solana pubkey must be 32 bytes");
  }
  const hi = BigInt("0x" + Buffer.from(pubkeyBytes.subarray(0, 16)).toString("hex"));
  const lo = BigInt("0x" + Buffer.from(pubkeyBytes.subarray(16, 32)).toString("hex"));
  return H([hi, lo]);
}

class PoseidonTree {
  constructor(depth = TREE_DEPTH) {
    this.depth = depth;
    this.zeros = [0n];
    for (let i = 1; i <= depth; i++) {
      this.zeros.push(H([this.zeros[i - 1], this.zeros[i - 1]]));
    }
    this.nodes = new Map(); // "level:index" -> BigInt
    this.nextIndex = 0;
    this.currentRoot = this.zeros[depth];
  }

  node(level, index) {
    const v = this.nodes.get(level + ":" + index);
    return v === undefined ? this.zeros[level] : v;
  }

  // Insert a deposit: computes the bound leaf Poseidon(cm, amount) and
  // inserts THAT — mirroring the on-chain program's deposit handler.
  // `amount` is required: silently inserting a raw commitment was the
  // pre-fix behavior that made NEW-1 possible off-chain.
  insert(cm, amount) {
    if (amount === undefined) {
      throw new Error("PoseidonTree.insert: amount required — the tree holds bound leaves Poseidon(cm, amount), not raw commitments");
    }
    return this.insertLeaf(boundLeaf(cm, amount));
  }

  // Insert an already-computed leaf value (e.g. a bound leaf reconstructed
  // by the indexer from a deposit event's (cm, amount) pair).
  insertLeaf(leaf) {
    const index = this.nextIndex++;
    let cur = BigInt(leaf);
    let idx = index;
    this.nodes.set("0:" + idx, cur);
    for (let level = 0; level < this.depth; level++) {
      const isRight = idx % 2 === 1;
      const sibling = this.node(level, isRight ? idx - 1 : idx + 1);
      cur = isRight ? H([sibling, cur]) : H([cur, sibling]);
      idx = Math.floor(idx / 2);
      this.nodes.set(level + 1 + ":" + idx, cur);
    }
    this.currentRoot = cur;
    return index;
  }

  root() {
    return this.currentRoot;
  }

  // Merkle path for a leaf index, LSB-first indices, matching merkle.circom.
  path(index) {
    const pathElements = [];
    const pathIndices = [];
    let idx = index;
    for (let level = 0; level < this.depth; level++) {
      const isRight = idx % 2 === 1;
      pathElements.push(this.node(level, isRight ? idx - 1 : idx + 1).toString());
      pathIndices.push(isRight ? 1 : 0);
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }
}

module.exports = {
  TREE_DEPTH,
  initPoseidon,
  H,
  deriveNullifierKey,
  deriveOwnerId,
  noteCommitment,
  boundLeaf,
  nullifier,
  recipientFromPubkey,
  PoseidonTree,
};
