// convert.js — snarkjs JSON <-> byte encodings used by groth16-solana
// style on-chain verifiers (e.g. Light Protocol's groth16-solana crate,
// which sits on Solana's alt_bn128 precompiles).
//
// Encodings (all integers big-endian, fixed width):
//   G1 point:        64 bytes  = x (32) || y (32)
//   G2 point:       128 bytes  = x_c1 (32) || x_c0 (32) || y_c1 (32) || y_c0 (32)
//                    i.e. Fp2 components are emitted IMAGINARY FIRST (c1, c0),
//                    which is the ordering Solana's alt_bn128 precompiles and
//                    the groth16-solana crate expect. snarkjs JSON stores Fp2
//                    as [c0, c1] (real first), so the pair is swapped here.
//   Public input:    32 bytes  = field element, big-endian.
//   Proof:          256 bytes  = proof_a (G1, 64) || proof_b (G2, 128)
//                                || proof_c (G1, 64)
//   Verification key byte blob (keys/vk_solana.bin), in order:
//     vk_alpha_g1 (64) || vk_beta_g2 (128) || vk_gamma_g2 (128)
//     || vk_delta_g2 (128) || vk_ic[0..=nr_pubinputs] (64 each)
//   nr_pubinputs for the withdraw circuit is 4 (root, nf, recipient, amount),
//   so vk_ic has 5 entries and the blob is 64+128*3+64*5 = 768 bytes.

function feTo32Bytes(decString) {
  let v = BigInt(decString);
  if (v < 0n) throw new Error("negative field element");
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("field element does not fit in 32 bytes");
  return buf;
}

function g1ToBytes(point) {
  // snarkjs: [x, y, z] decimal strings, z == "1" for affine
  return Buffer.concat([feTo32Bytes(point[0]), feTo32Bytes(point[1])]);
}

function g2ToBytes(point) {
  // snarkjs: [[x_c0, x_c1], [y_c0, y_c1], [z_c0, z_c1]]
  const [x, y] = point;
  return Buffer.concat([
    feTo32Bytes(x[1]), // x_c1 (imaginary) first
    feTo32Bytes(x[0]), // x_c0
    feTo32Bytes(y[1]), // y_c1
    feTo32Bytes(y[0]), // y_c0
  ]);
}

function vkToSolana(vkJson) {
  const parts = {
    vk_alpha_g1: g1ToBytes(vkJson.vk_alpha_1),
    vk_beta_g2: g2ToBytes(vkJson.vk_beta_2),
    vk_gamma_g2: g2ToBytes(vkJson.vk_gamma_2),
    vk_delta_g2: g2ToBytes(vkJson.vk_delta_2),
    vk_ic: vkJson.IC.map(g1ToBytes),
  };
  const blob = Buffer.concat([
    parts.vk_alpha_g1,
    parts.vk_beta_g2,
    parts.vk_gamma_g2,
    parts.vk_delta_g2,
    ...parts.vk_ic,
  ]);
  return {
    nr_pubinputs: vkJson.nPublic,
    vk_alpha_g1: parts.vk_alpha_g1.toString("hex"),
    vk_beta_g2: parts.vk_beta_g2.toString("hex"),
    vk_gamma_g2: parts.vk_gamma_g2.toString("hex"),
    vk_delta_g2: parts.vk_delta_g2.toString("hex"),
    vk_ic: parts.vk_ic.map((b) => b.toString("hex")),
    blob,
  };
}

function proofToBytes(proofJson) {
  return Buffer.concat([
    g1ToBytes(proofJson.pi_a),
    g2ToBytes(proofJson.pi_b),
    g1ToBytes(proofJson.pi_c),
  ]);
}

function publicInputsToBytes(publicSignals) {
  return Buffer.concat(publicSignals.map((s) => feTo32Bytes(s)));
}

module.exports = { feTo32Bytes, g1ToBytes, g2ToBytes, vkToSolana, proofToBytes, publicInputsToBytes };
