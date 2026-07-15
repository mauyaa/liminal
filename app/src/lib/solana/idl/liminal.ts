/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/liminal.json`.
 */
export type Liminal = {
  "address": "AHJnF6Ppec39gEfLnkHtMk11V23gwYPfKa3C6F88bbkD",
  "metadata": {
    "name": "liminal",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "fundOrder",
      "discriminator": [
        224,
        98,
        132,
        110,
        157,
        216,
        234,
        54
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "relations": [
            "orderState"
          ]
        },
        {
          "name": "orderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "marketItemId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "unifiedVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  109,
                  105,
                  110,
                  97,
                  108,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeListing",
      "discriminator": [
        170,
        54,
        135,
        232,
        166,
        202,
        75,
        54
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "orderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "marketItemId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "deliveryWindow",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "unifiedVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  109,
                  105,
                  110,
                  97,
                  108,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  109,
                  105,
                  110,
                  97,
                  108,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116,
                  45,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refundOrder",
      "discriminator": [
        164,
        168,
        47,
        144,
        154,
        1,
        241,
        255
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone may trigger a timeout refund once the",
            "delivery deadline has passed. Only pays the transaction fee."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "relations": [
            "orderState"
          ]
        },
        {
          "name": "orderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "marketItemId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "unifiedVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  109,
                  105,
                  110,
                  97,
                  108,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleOrder",
      "discriminator": [
        80,
        74,
        204,
        34,
        12,
        183,
        66,
        66
      ],
      "accounts": [
        {
          "name": "buyer",
          "docs": [
            "Buyer confirms receipt and releases funds to the seller."
          ],
          "signer": true,
          "relations": [
            "orderState"
          ]
        },
        {
          "name": "seller",
          "relations": [
            "orderState"
          ]
        },
        {
          "name": "orderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "marketItemId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "unifiedVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  109,
                  105,
                  110,
                  97,
                  108,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "sellerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "orderState",
      "discriminator": [
        60,
        123,
        67,
        162,
        96,
        43,
        173,
        225
      ]
    },
    {
      "name": "unifiedVault",
      "discriminator": [
        230,
        0,
        201,
        226,
        183,
        212,
        143,
        139
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Calculation overflow or underflow occurred."
    },
    {
      "code": 6001,
      "name": "invalidState",
      "msg": "Order state does not permit this action."
    },
    {
      "code": 6002,
      "name": "invalidListingParams",
      "msg": "Listing amount and delivery window must be greater than zero."
    },
    {
      "code": 6003,
      "name": "deadlineNotReached",
      "msg": "The delivery deadline has not yet passed."
    }
  ],
  "types": [
    {
      "name": "escrowStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initialized"
          },
          {
            "name": "funded"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "orderState",
      "docs": [
        "A single merchant listing / order. Created by the seller, funded by the",
        "buyer, then resolved by either settlement (buyer confirms) or timeout",
        "refund (deadline passes while still `Funded`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "principalAmount",
            "type": "u64"
          },
          {
            "name": "marketItemId",
            "type": "u64"
          },
          {
            "name": "startTimestamp",
            "type": "i64"
          },
          {
            "name": "deliveryWindow",
            "type": "i64"
          },
          {
            "name": "deliveryDeadline",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "unifiedVault",
      "docs": [
        "Global, per-mint escrow custody account. One `UnifiedVault` holds every",
        "buyer's in-escrow principal for a given stablecoin mint, so orders don't",
        "each need their own token account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenVault",
            "type": "pubkey"
          },
          {
            "name": "totalActivePrincipal",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "orderSeed",
      "type": "bytes",
      "value": "[111, 114, 100, 101, 114, 45, 115, 116, 97, 116, 101]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[108, 105, 109, 105, 110, 97, 108, 45, 118, 97, 117, 108, 116]"
    },
    {
      "name": "vaultTokenSeed",
      "type": "bytes",
      "value": "[108, 105, 109, 105, 110, 97, 108, 45, 118, 97, 117, 108, 116, 45, 116, 111, 107, 101, 110]"
    }
  ]
};
