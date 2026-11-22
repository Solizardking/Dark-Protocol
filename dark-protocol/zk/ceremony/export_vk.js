// export_vk.js — parameterized sibling of ../scripts/export_vk.js.
//
// The tree's export_vk.js is hardwired to keys/verification_key.json and
// overwrites the canonical vk_solana.{bin,json}. This version converts an
// ARBITRARY snarkjs verification key (e.g. a ceremony final, living in a
// scratch/output directory) into the groth16-solana byte format WITHOUT
// touching the tree's canonical copies:
//
//   node ceremony/export_vk.js <verification_key.json> <out-dir>
//
// Writes <out-dir>/vk_solana.bin (768 bytes) and <out-dir>/vk_solana.json,
// refusing to overwrite either. Byte layout (see ../scripts/convert.js):
//   alpha_g1(64) || beta_g2(128) || gamma_g2(128) || delta_g2(128)
//   || ic[0..nPublic](64 each)   — G2 limbs imaginary-first (c1||c0).
const fs = require("fs");
const path = require("path");
const conv = require("../scripts/convert");

const [vkPath, outDir] = process.argv.slice(2);
if (!vkPath || !outDir) {
  console.error("usage: node export_vk.js <verification_key.json> <out-dir>");
  process.exit(2);
}
if (!fs.existsSync(vkPath)) {
  console.error("ERROR: verification key not found: " + vkPath);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const binPath = path.join(outDir, "vk_solana.bin");
const jsonPath = path.join(outDir, "vk_solana.json");
for (const p of [binPath, jsonPath]) {
  if (fs.existsSync(p)) {
    console.error("ERROR: refusing to overwrite existing file: " + p);
    process.exit(1);
  }
}

const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));
const out = conv.vkToSolana(vk);

fs.writeFileSync(binPath, out.blob);
delete out.blob;
out.curve = vk.curve;
out.protocol = vk.protocol;
out.nPublic = vk.nPublic;
out.byte_layout =
  "alpha_g1[64] || beta_g2[128] || gamma_g2[128] || delta_g2[128] || ic[0..=nPublic][64 each]; " +
  "G1 = x||y big-endian; G2 = x_c1||x_c0||y_c1||y_c0 big-endian (Fp2 imaginary-first, alt_bn128 precompile order)";
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

console.log("wrote " + binPath + " (" + fs.statSync(binPath).size + " bytes)");
console.log("nr_pubinputs:", out.nr_pubinputs, " ic points:", out.vk_ic.length);
