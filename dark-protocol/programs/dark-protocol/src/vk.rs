//! Groth16 verifying key for the withdraw circuit.
//!
//! ════════════════════════════════════════════════════════════════════════
//! ✅  REAL VERIFYING KEY LANDED — from the ZK track's withdraw circuit.
//! ════════════════════════════════════════════════════════════════════════
//!
//! Source of truth: `zk/keys/verification_key.json` (snarkjs export of
//! `withdraw.zkey`), converted with the ZK track's own scripts
//! (`zk/scripts/export_vk.js`, `zk/scripts/generate_vk_rs.js`) into the
//! groth16-solana byte format (big-endian limbs, G2 limbs ordered c1‖c0 per
//! 64-byte half). The constants below are that generated output, pasted
//! verbatim — never hand-typed.
//!
//! This is the SECOND dev ceremony (2026-11-17): the withdraw circuit
//! changed for the re-audit's NEW-1 fix (the Merkle leaf is now the
//! deposit-bound `Poseidon(cm, amount)`), so phase 2 was re-run against
//! the same verified phase-1 ptau ("Powers of Tau Ok!", "ZKey Ok!") and
//! this key replaces the first ceremony's. The spliced constants were
//! verified byte-identical (768/768) against `zk/vk_solana.bin`.
//!
//! ⚠️  DEV CEREMONY — PRODUCTION REQUIRES AN MPC CEREMONY  ⚠️
//! This key comes from a LOCAL, SINGLE-CONTRIBUTOR trusted setup (phase 1
//! Powers of Tau + phase 2 contribution, both run on one VM by one party).
//! Whoever held the ceremony toxic waste could forge proofs against this
//! key. It is suitable for development and devnet testing ONLY. A
//! production deployment MUST re-run the setup as a multi-party (MPC)
//! ceremony and replace these constants with the resulting key.
//!
//! Public inputs for the withdraw circuit, in order (shared contract):
//! `[root, nf, recipient, amount]` — so `vk_ic` has 4 + 1 = 5 points.

use groth16_solana::groth16::Groth16Verifyingkey;

/// Whether the constants in this module are the placeholder (generator)
/// key. Mirrored into the Pool account at `initialize` so the placeholder
/// state is visible to anyone inspecting the pool on-chain.
pub const VK_IS_PLACEHOLDER: bool = false;

/// Number of public inputs of the withdraw circuit: root, nf, recipient,
/// amount.
pub const NR_PUBLIC_INPUTS: usize = 4;

pub const VK_ALPHA_G1: [u8; 64] = [
    26, 51, 69, 117, 89, 147, 180, 11, 154, 106, 137, 174, 9, 150, 23, 187,
    189, 71, 27, 213, 221, 88, 229, 6, 22, 221, 17, 225, 181, 11, 94, 158,
    0, 178, 33, 164, 39, 32, 7, 25, 76, 153, 174, 139, 106, 57, 246, 61,
    68, 180, 243, 34, 225, 150, 151, 99, 219, 198, 17, 163, 144, 91, 154, 134,
];

pub const VK_BETA_G2: [u8; 128] = [
    41, 100, 102, 245, 241, 211, 233, 201, 159, 29, 152, 183, 6, 90, 158, 238,
    100, 13, 187, 165, 17, 164, 137, 83, 177, 177, 242, 205, 180, 180, 216, 174,
    19, 22, 133, 113, 246, 106, 194, 141, 0, 183, 230, 125, 86, 16, 16, 155,
    60, 156, 212, 237, 237, 74, 75, 183, 140, 187, 217, 106, 21, 69, 111, 228,
    45, 95, 174, 20, 49, 47, 227, 159, 54, 49, 190, 205, 83, 182, 147, 14,
    2, 117, 164, 236, 194, 10, 51, 88, 98, 91, 140, 84, 172, 175, 28, 10,
    37, 74, 46, 235, 46, 34, 235, 232, 63, 232, 191, 38, 69, 209, 236, 247,
    101, 35, 38, 111, 48, 202, 90, 5, 3, 100, 243, 80, 150, 40, 122, 172,
];

pub const VK_GAMMA_G2: [u8; 128] = [
    25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37,
    241, 170, 73, 51, 53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194,
    24, 0, 222, 239, 18, 31, 30, 118, 66, 106, 0, 102, 94, 92, 68, 121,
    103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92, 217, 146, 246, 237,
    9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173, 105, 12, 51, 149,
    188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151, 91,
    18, 200, 94, 165, 219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143,
    227, 209, 231, 105, 12, 67, 211, 123, 76, 230, 204, 1, 102, 250, 125, 170,
];

pub const VK_DELTA_G2: [u8; 128] = [
    6, 132, 107, 194, 197, 18, 213, 169, 147, 203, 173, 165, 149, 2, 198, 72,
    145, 66, 106, 27, 12, 63, 252, 62, 45, 63, 195, 182, 22, 244, 193, 84,
    20, 142, 109, 252, 216, 228, 239, 240, 203, 59, 229, 147, 221, 140, 60, 206,
    98, 88, 33, 176, 250, 1, 66, 238, 198, 223, 84, 156, 167, 173, 2, 69,
    32, 5, 164, 50, 126, 6, 77, 232, 141, 33, 79, 188, 45, 67, 228, 102,
    57, 197, 183, 126, 242, 185, 229, 238, 242, 215, 31, 5, 233, 65, 183, 101,
    37, 14, 125, 242, 16, 146, 8, 147, 87, 173, 24, 197, 137, 99, 125, 3,
    216, 163, 108, 82, 71, 101, 50, 68, 110, 2, 52, 186, 225, 246, 162, 65,
];

pub const VK_IC: [[u8; 64]; NR_PUBLIC_INPUTS + 1] = [
    [
        39, 112, 147, 203, 21, 158, 190, 234, 59, 65, 181, 106, 1, 214, 110, 230,
        219, 75, 116, 205, 218, 73, 134, 153, 116, 65, 120, 197, 118, 79, 205, 16,
        39, 9, 162, 231, 79, 136, 166, 60, 179, 232, 1, 65, 31, 30, 121, 148,
        45, 254, 185, 170, 60, 75, 5, 191, 14, 153, 68, 217, 230, 67, 27, 167,
    ],
    [
        45, 219, 241, 111, 95, 89, 49, 83, 23, 177, 219, 28, 160, 192, 127, 56,
        239, 208, 18, 189, 204, 88, 63, 47, 42, 143, 162, 223, 6, 218, 205, 203,
        2, 115, 121, 248, 6, 108, 232, 141, 224, 236, 162, 128, 133, 80, 64, 254,
        231, 206, 69, 110, 231, 226, 33, 126, 145, 130, 88, 246, 205, 49, 25, 215,
    ],
    [
        19, 74, 156, 203, 60, 226, 39, 0, 168, 199, 148, 7, 223, 126, 254, 228,
        12, 202, 154, 14, 138, 158, 13, 28, 247, 81, 78, 116, 202, 137, 142, 58,
        14, 183, 222, 134, 49, 154, 210, 116, 135, 31, 218, 232, 34, 255, 191, 56,
        57, 36, 183, 56, 252, 234, 143, 190, 142, 21, 41, 211, 134, 74, 152, 175,
    ],
    [
        35, 163, 68, 182, 232, 92, 136, 111, 123, 125, 148, 247, 232, 173, 86, 92,
        131, 13, 124, 19, 157, 61, 134, 154, 93, 133, 235, 248, 203, 129, 198, 49,
        5, 245, 115, 76, 50, 119, 101, 68, 190, 198, 117, 151, 234, 168, 124, 132,
        159, 128, 196, 28, 75, 169, 76, 212, 53, 231, 216, 245, 115, 16, 238, 91,
    ],
    [
        2, 75, 75, 144, 193, 132, 62, 252, 234, 118, 155, 19, 207, 203, 118, 12,
        247, 195, 104, 42, 242, 137, 176, 145, 148, 142, 84, 153, 170, 61, 23, 79,
        40, 219, 35, 16, 197, 28, 71, 68, 93, 214, 97, 170, 16, 98, 232, 235,
        235, 152, 12, 47, 227, 120, 176, 154, 209, 1, 215, 194, 119, 126, 75, 182,
    ],
];

pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: NR_PUBLIC_INPUTS,
    vk_alpha_g1: VK_ALPHA_G1,
    vk_beta_g2: VK_BETA_G2,
    vk_gamme_g2: VK_GAMMA_G2,
    vk_delta_g2: VK_DELTA_G2,
    vk_ic: &VK_IC,
};

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::G2Affine;
    use ark_ec::AffineRepr;
    use ark_serialize::{CanonicalSerialize, Compress};

    fn convert<const CHUNK: usize, const N: usize>(input: &[u8; N]) -> [u8; N] {
        let mut out = [0u8; N];
        for (i, chunk) in input.chunks_exact(CHUNK).enumerate() {
            for (j, _) in chunk.iter().enumerate() {
                out[i * CHUNK + j] = chunk[CHUNK - 1 - j];
            }
        }
        out
    }

    #[test]
    fn gamma_is_the_g2_generator_in_solana_byte_format() {
        // Format cross-check: in every real Groth16 verifying key, gamma is
        // the BN254 G2 generator. Recompute its arkworks serialization,
        // convert to the groth16-solana byte layout (per-64-byte-half limb
        // reversal), and compare with the dropped-in constant — this pins
        // the byte-ordering convention end to end, so a conversion error in
        // the other (non-generator) points would have to be a different
        // kind of bug than a format flip.
        let g2 = G2Affine::generator();
        let mut raw = [0u8; 128];
        g2.serialize_with_mode(&mut raw[..], Compress::No).unwrap();
        assert_eq!(convert::<64, 128>(&raw), VK_GAMMA_G2);
        // And the real key is not the old placeholder: delta (a random
        // ceremony point) differs from gamma, unlike the generator key.
        assert_ne!(VK_DELTA_G2, VK_GAMMA_G2);
    }

    #[test]
    fn vk_shape_matches_withdraw_public_inputs() {
        assert_eq!(VERIFYING_KEY.nr_pubinputs, 4);
        assert_eq!(VERIFYING_KEY.vk_ic.len(), NR_PUBLIC_INPUTS + 1);
        assert!(!VK_IS_PLACEHOLDER); // the real VK is landed
    }
}
