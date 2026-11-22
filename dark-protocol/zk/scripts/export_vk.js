// export_vk.js — convert keys/verification_key.json (snarkjs format) into
// the byte format used by groth16-solana-style verifiers:
//   keys/vk_solana.json — per-point hex + metadata
//   keys/vk_solana.bin  — 768-byte blob:
//     alpha_g1(64) || beta_g2(128) || gamma_g2(128) || delta_g2(128)
//     || ic[0..4](64 each)
// See scripts/convert.js for the exact Fp2 ordering convention.
const fs = require("fs");
const path = require("path");
const conv = require("./convert");

const zkDir = path.join(__dirname, "..");
const keysDir = path.join(zkDir, "keys");
const vk = JSON.parse(fs.readFileSync(path.join(keysDir, "verification_key.json"), "utf8"));
const out = conv.vkToSolana(vk);

fs.writeFileSync(path.join(keysDir, "vk_solana.bin"), out.blob);
delete out.blob;
out.curve = vk.curve;
out.protocol = vk.protocol;
out.nPublic = vk.nPublic;
out.byte_layout =
  "alpha_g1[64] || beta_g2[128] || gamma_g2[128] || delta_g2[128] || ic[0..=nPublic][64 each]; " +
  "G1 = x||y big-endian; G2 = x_c1||x_c0||y_c1||y_c0 big-endian (Fp2 imaginary-first, alt_bn128 precompile order)";
const json = JSON.stringify(out, null, 2);
fs.writeFileSync(path.join(keysDir, "vk_solana.json"), json);
// Canonical copies at the zk/ root — this is the handoff location the
// program track reads (see INTEGRATIONS.md §5 and program/src/vk.rs).
fs.writeFileSync(path.join(zkDir, "vk_solana.json"), json);
fs.writeFileSync(path.join(zkDir, "vk_solana.bin"), conv.vkToSolana(vk).blob);
console.log("vk_solana.bin bytes:", fs.statSync(path.join(keysDir, "vk_solana.bin")).size);
console.log("nr_pubinputs:", out.nr_pubinputs, " ic points:", out.vk_ic.length);
