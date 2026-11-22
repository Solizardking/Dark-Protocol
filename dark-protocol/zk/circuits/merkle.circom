pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

// MerkleInclusion(levels)
// Binary Merkle inclusion proof with 2-input Poseidon nodes (circomlib).
// Convention (must match the JS tree builder and the on-chain program):
//   - leaf index bits are LSB-first: pathIndices[0] is the lowest bit of the
//     leaf index (level 0 = leaf level).
//   - pathIndices[i] == 0  =>  running node is the LEFT child, sibling on right.
//   - pathIndices[i] == 1  =>  running node is the RIGHT child, sibling on left.
//   - empty-leaf value is 0; zero-subtree hashes are
//       zeros[0] = 0, zeros[i+1] = Poseidon(zeros[i], zeros[i]).
template MerkleInclusion(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component hashers[levels];
    signal cur[levels + 1];
    signal lefts[levels];
    signal rights[levels];

    cur[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // path index must be a bit
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = Poseidon(2);
        // left  = idx == 0 ? cur : sibling
        // right = idx == 0 ? sibling : cur
        lefts[i] <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rights[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        hashers[i].inputs[0] <== lefts[i];
        hashers[i].inputs[1] <== rights[i];
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[levels];
}
