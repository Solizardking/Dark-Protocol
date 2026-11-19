//! Depth-20 Merkle zero chain ("empty-subtree roots") as a static limb
//! table — the constants the W5-NEW-1 fix substitutes for on-chain
//! recomputation.
//!
//! The zero chain is defined by `z[0] = 0`,
//! `z[i+1] = Poseidon(z[i], z[i])` (circomlib Poseidon over BN254 — the
//! program's `poseidon2`). Its 21 values at depth 20 are constants of
//! the hash function and the depth alone; they depend on no pool state.
//!
//! Until this fix, `merkle::zero_chain` recomputed them on-chain on
//! every call: 20 Poseidon hashes per call, paid twice by `initialize`
//! (`Frontier::new` and `Frontier::root`) on top of `root`'s 20-hash
//! fold — 60 hashes that pushed `initialize` past the 1.4M CU
//! per-transaction cap, so the pool could never be created (W5-NEW-1,
//! found by the W5 devnet rehearsal). `deposit` paid the same
//! recomputation inside every `insert`.
//!
//! Provenance: this table was generated mechanically by iterating the
//! defining recurrence with the program's own `poseidon2` host-side
//! and emitting the values as `BigInteger256` limb quads — the same
//! representation `poseidon_params.rs` uses for the Poseidon round
//! constants. It was not transcribed by hand. The test
//! `merkle::tests::zero_chain_table_matches_computed_chain` re-derives
//! the chain from scratch with `poseidon2` and asserts every entry
//! bit-for-bit, so a wrong table cannot pass the suite.
//!
//! No value changes: every root, frontier entry and leaf the program
//! produces is bit-identical to the recomputing implementation; only
//! the compute cost changes.

use ark_ff::{BigInteger, BigInteger256};

/// Depth covered by the table (`merkle::TREE_DEPTH`).
pub const ZERO_CHAIN_DEPTH: usize = 20;

/// z[0..=20] as `BigInteger256` limb quads (little-endian u64 limbs,
/// the representation ark uses), in chain order.
static ZERO_LIMBS: [[u64; 4]; ZERO_CHAIN_DEPTH + 1] = [
    [0, 0, 0, 0], // z[0]
    [12121982123933845604, 15866503461060138275, 4389536233047581825, 2348897666712444587], // z[1]
    [7468225217650880993, 2745582564151823856, 16082383337502844908, 1182589892303069795], // z[2]
    [2942397237618463288, 5079056432414268885, 3331948549133246726, 1798118438174909103], // z[3]
    [14604214085630072106, 17417434438447825509, 7142990386202747717, 574728161608577235], // z[4]
    [8889239344713842517, 12004843489313598797, 14511476837172062471, 3140362845087511541], // z[5]
    [2094698994635677048, 18363179443317986145, 5110034315621294524, 3309745253273453974], // z[6]
    [12152025428588442781, 10017436759814941823, 9425858230132234619, 541159718738691305], // z[7]
    [4921517651709381729, 7019755190471434522, 5772467408839395114, 3433403116595193766], // z[8]
    [4476954775899658055, 16455725108873537707, 17057243094356074342, 1047161090952723745], // z[9]
    [16024218579227970290, 17967272313006142771, 2914245474723476585, 1977645224100974366], // z[10]
    [13743978887778235958, 12026548226003306677, 5908934581865977881, 2273623068421011000], // z[11]
    [15026148025623246938, 7017365375651121320, 13362203775692766459, 3196855305397947311], // z[12]
    [7230795768364253136, 5689669941378413668, 2347922809012855059, 1496674231358065592], // z[13]
    [1590208600321288204, 1278500406467332564, 2166443550355012015, 1805155861746184086], // z[14]
    [11939997620247751826, 1254162772588974346, 12400438686983746541, 2520197928408072530], // z[15]
    [17921885410191635235, 6508386636717280494, 11488439165356304983, 3061458853693851659], // z[16]
    [5581610735822616978, 5116163710525148053, 14302018175288885244, 3351107917329305281], // z[17]
    [3838795989580247311, 10011342187661595175, 5324038500973915796, 1105569211509001899], // z[18]
    [4367615745282485450, 18336655542467774180, 15417577734611668508, 1743155184994571594], // z[19]
    [15236160083837132606, 9802680828863910649, 1759829803479827694, 2392791747812006571], // z[20]
];

/// The full zero chain z[0..=20] as big-endian byte arrays — the form
/// `merkle` consumes.
pub fn zero_chain_20() -> [[u8; 32]; ZERO_CHAIN_DEPTH + 1] {
    let mut out = [[0u8; 32]; ZERO_CHAIN_DEPTH + 1];
    for (i, limbs) in ZERO_LIMBS.iter().enumerate() {
        out[i].copy_from_slice(&BigInteger256::new(*limbs).to_bytes_be());
    }
    out
}
