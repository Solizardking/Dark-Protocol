//! Dev-only helper: prints the BN254 generator points encoded in
//! groth16-solana byte format (big-endian limbs; G2 limbs ordered
//! c1 || c0 per 64-byte half — the crate's `convert_endianness` layout).
//! Used once to generate the PLACEHOLDER verifying key in src/vk.rs.
//! Run: `cargo run --example gen_vk`

use ark_bn254::{G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_serialize::{CanonicalSerialize, Compress};

fn convert<const CHUNK: usize, const N: usize>(input: &[u8; N]) -> [u8; N] {
    let mut out = [0u8; N];
    for (i, chunk) in input.chunks_exact(CHUNK).enumerate() {
        for j in 0..CHUNK {
            out[i * CHUNK + j] = chunk[CHUNK - 1 - j];
        }
    }
    out
}

fn print_arr(name: &str, bytes: &[u8]) {
    println!("pub const {name}: [u8; {}] = [", bytes.len());
    for chunk in bytes.chunks(16) {
        print!("    ");
        for b in chunk {
            print!("{b}, ");
        }
        println!();
    }
    println!("];");
}

fn main() {
    let g1 = G1Affine::generator();
    let mut g1_bytes = [0u8; 64];
    g1.serialize_with_mode(&mut g1_bytes[..], Compress::No).unwrap();
    let g1_be = convert::<32, 64>(&g1_bytes);
    print_arr("G1_GENERATOR_BE", &g1_be);

    let g2 = G2Affine::generator();
    let mut g2_bytes = [0u8; 128];
    g2.serialize_with_mode(&mut g2_bytes[..], Compress::No).unwrap();
    let g2_be = convert::<64, 128>(&g2_bytes);
    print_arr("G2_GENERATOR_BE", &g2_be);
}
