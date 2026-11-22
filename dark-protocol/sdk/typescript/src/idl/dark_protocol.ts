/**
 * Bundled IDL for the merged dark-protocol program, generated from the
 * merged crate via Anchor's idl-build feature (TRANSPLANT-SPEC W6) and
 * normalized to the Anchor 0.32 IDL spec (plain type names, object-form
 * `defined` references). The `address` field is the W3 placeholder
 * (keypair-less, sha256-derived); DarkProtocolClient always overrides
 * it with the configured program ID, and W5 replaces it everywhere in
 * one change when the fresh program keypair is generated.
 */
export const DARK_PROTOCOL_IDL = {
  "address": "2GmpuVGfFVfhiqUWrrhkkWBk3i8TpbTuqyiZNXETA5kL",
  "metadata": {
    "name": "dark_protocol",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Dark Protocol \u2014 Groth16-verified shielded SOL pool (BN254/Poseidon). Surviving core transplanted from the Dark DeFi rewrite crate `dark-protocol-v2` per TRANSPLANT-SPEC W1/W2; internal logic unchanged from the donor."
  },
  "instructions": [
    {
      "name": "initialize",
      "docs": [
        "Create the Pool PDA and its vault PDA. The signer becomes the pool",
        "authority. The authority has **no** fund-moving power in v1 \u2014 it is",
        "recorded for a future, separately-audited admin track. The empty",
        "tree's root seeds the root-history ring."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vault",
          "docs": [
            "derived from the pool and it can sign only via this program's",
            "`withdraw` CPI. It stores no data."
          ]
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "docs": [
        "Shield `amount` lamports: pull SOL from the depositor into the vault",
        "and insert the **bound leaf** `Poseidon(cm, amount)` as the next",
        "leaf. The binding is the NEW-1 fix: the leaf the tree holds commits",
        "to the deposited amount, and the withdraw circuit can only open a",
        "leaf whose commitment was computed over that same amount \u2014 so the",
        "value inside `cm` can never exceed (or differ from) the lamports",
        "actually deposited. Nothing about the note (owner, blinding) is",
        "revealed or stored \u2014 only `cm`, which is itself a Poseidon hash",
        "output, and the bound leaf derived from it."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vault",
          "docs": [
            "program transfer destination."
          ],
          "writable": true
        },
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "cm",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Unshield `amount` lamports to the recipient account, against a",
        "Groth16 proof. Checks run in the order documented at the top of this",
        "file: known root \u2192 ledger solvency \u2192 proof verification \u2192 payment.",
        "The nullifier PDA is created by Anchor's `init` before this handler",
        "runs; its prior existence aborts the transaction before any of this",
        "executes. Any error aborts the whole transaction, rolling back the",
        "nullifier creation \u2014 a rejected proof never burns a nullifier."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "vault",
          "docs": [
            "program transfer source, signed with the vault's PDA seeds."
          ],
          "writable": true
        },
        {
          "name": "nullifier_marker",
          "docs": [
            "The spent-nullifier marker. `init` is the double-spend control:",
            "if a marker for this `nf` already exists, account creation fails",
            "and the whole transaction aborts before any payment. Seeds bind the",
            "marker to exactly the `nf` proven in this instruction."
          ],
          "writable": true
        },
        {
          "name": "recipient",
          "docs": [
            "proof, whose `recipient` public input is computed by the program",
            "from this account's key (see `poseidon::recipient_field`), so funds",
            "can only land on the exact payee the proof was made for. Any account",
            "may relay the transaction."
          ],
          "writable": true
        },
        {
          "name": "fee_payer",
          "docs": [
            "Pays the nullifier marker's rent. Any signer (recipient, relayer,",
            "or third party) may pay; the fee payer gains no rights over the",
            "payout, which is bound to `recipient` by the proof."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "proof",
          "type": {
            "array": [
              "u8",
              256
            ]
          }
        },
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nf",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transfer",
      "docs": [
        "Shielded transfer (spend one note, create two) is **not enabled**.",
        "",
        "The verify \u2192 nullify \u2192 append pattern is established by `withdraw`,",
        "but a transfer needs its own circuit and verifying key, whose",
        "public-input layout the shared contract does not yet define (the",
        "withdraw circuit's `[root, nf, recipient, amount]` cannot express",
        "hidden-value conservation between one input and two outputs). Until",
        "the ZK track specifies and delivers that circuit + VK, this",
        "instruction always errors \u2014 it never silently succeeds, never moves",
        "funds, and never consumes a nullifier."
      ],
      "discriminator": [
        163,
        52,
        200,
        231,
        140,
        3,
        69,
        186
      ],
      "accounts": [
        {
          "name": "pool"
        },
        {
          "name": "sender",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "_proof",
          "type": {
            "array": [
              "u8",
              256
            ]
          }
        },
        {
          "name": "_root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "_nf",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "_cm1",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "_cm2",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "NullifierMarker",
      "discriminator": [
        160,
        124,
        83,
        42,
        185,
        14,
        141,
        101
      ]
    },
    {
      "name": "Pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "types": [
    {
      "name": "NullifierMarker",
      "docs": [
        "Existence of this account *is* the spent record for `nf`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nf",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Pool",
      "docs": [
        "Global pool state. Deliberately contains **no note data**: no amounts",
        "per note, no ciphertexts, no depositor list \u2014 only the Merkle frontier,",
        "the root-history ring, and aggregate deposit/withdraw totals used for",
        "the solvency invariant."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Recorded at initialize; no fund-moving authority in v1."
            ],
            "type": "pubkey"
          },
          {
            "name": "current_root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "root_history",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                32
              ]
            }
          },
          {
            "name": "history_next",
            "type": "u8"
          },
          {
            "name": "history_len",
            "type": "u8"
          },
          {
            "name": "frontier",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                20
              ]
            }
          },
          {
            "name": "next_leaf_index",
            "type": "u64"
          },
          {
            "name": "total_deposited",
            "type": "u64"
          },
          {
            "name": "total_withdrawn",
            "type": "u64"
          },
          {
            "name": "vk_is_placeholder",
            "docs": [
              "Mirrors `vk::VK_IS_PLACEHOLDER` at initialize time."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vault_bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "NoteDeposited",
      "type": {
        "fields": [
          {
            "name": "cm",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "docs": [
              "The bound leaf actually inserted: `Poseidon(cm, amount)`. Emitted",
              "so off-chain tree builders (indexer, wallets) reconstruct the exact",
              "tree the program maintains (amount is also in the instruction data)."
            ],
            "name": "leaf",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "leaf_index",
            "type": "u64"
          },
          {
            "name": "new_root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "NoteWithdrawn",
      "type": {
        "fields": [
          {
            "name": "nf",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "ProtocolInitialized",
      "type": {
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "initial_root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vk_is_placeholder",
            "type": "bool"
          }
        ],
        "kind": "struct"
      }
    }
  ],
  "events": [
    {
      "discriminator": [
        27,
        177,
        212,
        105,
        19,
        136,
        143,
        45
      ],
      "name": "NoteDeposited"
    },
    {
      "discriminator": [
        216,
        218,
        163,
        184,
        169,
        239,
        60,
        29
      ],
      "name": "NoteWithdrawn"
    },
    {
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ],
      "name": "ProtocolInitialized"
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ZeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "ZeroCommitment",
      "msg": "Commitment must not be the zero field element"
    },
    {
      "code": 6002,
      "name": "NonCanonicalFieldElement",
      "msg": "Value is not a canonical BN254 field element encoding"
    },
    {
      "code": 6003,
      "name": "TreeFull",
      "msg": "Merkle tree is full"
    },
    {
      "code": 6004,
      "name": "UnknownRoot",
      "msg": "Merkle root is not in the pool's root history"
    },
    {
      "code": 6005,
      "name": "InsufficientPoolBalance",
      "msg": "Pool ledger balance does not cover this withdrawal"
    },
    {
      "code": 6006,
      "name": "ProofVerificationFailed",
      "msg": "Groth16 proof verification failed"
    },
    {
      "code": 6007,
      "name": "ArithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "PoseidonError",
      "msg": "Poseidon hashing failed"
    },
    {
      "code": 6009,
      "name": "TransferNotEnabled",
      "msg": "Shielded transfer is not enabled in v1: the transfer circuit and its verifying key have not been delivered by the ZK track"
    }
  ]
} as const;
