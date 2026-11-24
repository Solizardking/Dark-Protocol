//! CVLR rules for the seven Dark Protocol properties, one module per
//! property of `dark-protocol/aristotle/dark-protocol_spec.md`.
//!
//! Every rule drives the program's real instruction handlers
//! (`crate::dark_protocol::{initialize-state, deposit, withdraw,
//! transfer}`) through the harness in [`harness`], which constructs the
//! Anchor account structs by hand from in-memory `AccountInfo`s whose
//! keys, owners, flags and data satisfy the Aristotle spec's
//! precondition 1 (accounts as Anchor validation would deliver them;
//! assumption A6 in [`axioms`]).

pub mod axioms;
pub mod harness;
pub mod p0_no_ub;
pub mod p1_conservation;
pub mod p2_withdraw_gating;
pub mod p3_deposit_binding;
pub mod p4_authority;
pub mod p5_progress;
pub mod p6_root_history;
