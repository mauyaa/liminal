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
      "name": "challengeOrder",
      "discriminator": [
        243,
        77,
        207,
        201,
        99,
        167,
        98,
        12
      ],
      "accounts": [
        {
          "name": "buyer",
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
      "name": "confirmDelivery",
      "discriminator": [
        11,
        109,
        227,
        53,
        179,
        190,
        88,
        155
      ],
      "accounts": [
        {
          "name": "buyer",
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
    },
    {
      "name": "finalizeDelivery",
      "discriminator": [
        126,
        171,
        72,
        245,
        212,
        203,
        209,
        251
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may trigger this once the window has passed. Only pays the",
            "transaction fee."
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
    },
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
      "name": "fundOrderYield",
      "discriminator": [
        148,
        0,
        122,
        242,
        27,
        98,
        164,
        214
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
          "name": "orderKtokenAccount",
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
                  107,
                  116,
                  111,
                  107,
                  101,
                  110
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
          "name": "kaminoProgram"
        },
        {
          "name": "kaminoReserve",
          "writable": true
        },
        {
          "name": "kaminoLendingMarket"
        },
        {
          "name": "kaminoLendingMarketAuthority"
        },
        {
          "name": "kaminoReserveLiquiditySupply",
          "writable": true
        },
        {
          "name": "kaminoReserveCollateralMint",
          "writable": true
        },
        {
          "name": "kaminoPythOracle"
        },
        {
          "name": "kaminoSwitchboardPriceOracle"
        },
        {
          "name": "kaminoSwitchboardTwapOracle"
        },
        {
          "name": "kaminoScopePrices"
        },
        {
          "name": "instructionsSysvar"
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
          "name": "payer",
          "docs": [
            "Pays the listing's one-time rent - the seller themselves, or a",
            "sponsor (e.g. a relayer) covering it so a seller with zero SOL can",
            "still create a listing. Kept distinct from `seller` so sponsoring",
            "never requires impersonating the seller's own signature; the same",
            "key can fill both roles for a self-funded listing (one signature",
            "satisfies both Signer constraints)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "docs": [
            "Must still sign to authorize creating a listing under their own",
            "identity, regardless of who pays the rent."
          ],
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
      "name": "initializeOracleConfig",
      "discriminator": [
        131,
        55,
        232,
        105,
        168,
        248,
        10,
        102
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
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oraclePubkey",
          "type": "pubkey"
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
      "name": "initializeVaultYield",
      "discriminator": [
        80,
        230,
        81,
        34,
        82,
        12,
        102,
        7
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
      "args": [
        {
          "name": "kaminoLendingMarket",
          "type": "pubkey"
        },
        {
          "name": "kaminoReserve",
          "type": "pubkey"
        },
        {
          "name": "kaminoLendingMarketAuthority",
          "type": "pubkey"
        },
        {
          "name": "kaminoReserveLiquiditySupply",
          "type": "pubkey"
        },
        {
          "name": "kaminoReserveCollateralMint",
          "type": "pubkey"
        },
        {
          "name": "kaminoPythOracle",
          "type": "pubkey"
        },
        {
          "name": "kaminoSwitchboardPriceOracle",
          "type": "pubkey"
        },
        {
          "name": "kaminoSwitchboardTwapOracle",
          "type": "pubkey"
        },
        {
          "name": "kaminoScopePrices",
          "type": "pubkey"
        }
      ]
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
      "name": "refundOrderYield",
      "discriminator": [
        235,
        190,
        109,
        19,
        183,
        55,
        116,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone may trigger a timeout refund once the",
            "delivery deadline has passed. Only pays the transaction fee, and",
            "receives the reclaimed kToken-account rent as a small incentive."
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
          "name": "orderKtokenAccount",
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
                  107,
                  116,
                  111,
                  107,
                  101,
                  110
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
          "name": "kaminoProgram"
        },
        {
          "name": "kaminoReserve",
          "writable": true
        },
        {
          "name": "kaminoLendingMarket"
        },
        {
          "name": "kaminoLendingMarketAuthority"
        },
        {
          "name": "kaminoReserveLiquiditySupply",
          "writable": true
        },
        {
          "name": "kaminoReserveCollateralMint",
          "writable": true
        },
        {
          "name": "kaminoPythOracle"
        },
        {
          "name": "kaminoSwitchboardPriceOracle"
        },
        {
          "name": "kaminoSwitchboardTwapOracle"
        },
        {
          "name": "kaminoScopePrices"
        },
        {
          "name": "instructionsSysvar"
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
      "name": "resolveDispute",
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone holding a valid verdict attestation may",
            "trigger it. Only pays the transaction fee."
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
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
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
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        },
        {
          "name": "sellerBps",
          "type": "u16"
        },
        {
          "name": "verdictHash",
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
    },
    {
      "name": "settleOrderWithOracle",
      "discriminator": [
        50,
        114,
        225,
        75,
        41,
        43,
        144,
        128
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone holding a valid attestation may trigger",
            "settlement. Only pays the transaction fee."
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
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
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
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
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
      "name": "settleOrderYield",
      "discriminator": [
        243,
        39,
        88,
        75,
        142,
        94,
        190,
        230
      ],
      "accounts": [
        {
          "name": "buyer",
          "docs": [
            "Buyer confirms receipt and releases funds (principal + this order's",
            "share of accrued yield) to the seller. Marked mut: receives the",
            "reclaimed rent when the per-order kToken account is closed below."
          ],
          "writable": true,
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
          "name": "orderKtokenAccount",
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
                  107,
                  116,
                  111,
                  107,
                  101,
                  110
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
          "name": "kaminoProgram"
        },
        {
          "name": "kaminoReserve",
          "writable": true
        },
        {
          "name": "kaminoLendingMarket"
        },
        {
          "name": "kaminoLendingMarketAuthority"
        },
        {
          "name": "kaminoReserveLiquiditySupply",
          "writable": true
        },
        {
          "name": "kaminoReserveCollateralMint",
          "writable": true
        },
        {
          "name": "kaminoPythOracle"
        },
        {
          "name": "kaminoSwitchboardPriceOracle"
        },
        {
          "name": "kaminoSwitchboardTwapOracle"
        },
        {
          "name": "kaminoScopePrices"
        },
        {
          "name": "instructionsSysvar"
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
      "name": "signalDelivery",
      "discriminator": [
        141,
        208,
        171,
        215,
        162,
        165,
        100,
        20
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone holding a valid attestation may trigger this.",
            "Only pays the transaction fee - no funds move here."
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
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "orderState.mint",
                "account": "orderState"
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketItemId",
          "type": "u64"
        },
        {
          "name": "challengeWindowSecs",
          "type": "i64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "oracleConfig",
      "discriminator": [
        133,
        196,
        152,
        50,
        27,
        21,
        145,
        254
      ]
    },
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
  "events": [
    {
      "name": "disputeResolved",
      "discriminator": [
        121,
        64,
        249,
        153,
        139,
        128,
        236,
        187
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
    },
    {
      "code": 6004,
      "name": "yieldNotEnabled",
      "msg": "This vault was not configured for Kamino yield routing."
    },
    {
      "code": 6005,
      "name": "missingOracleAttestation",
      "msg": "Settlement requires a preceding Ed25519 signature-verification instruction in the same transaction."
    },
    {
      "code": 6006,
      "name": "invalidOracleAttestation",
      "msg": "The oracle attestation's signed message did not match this order and delivery status."
    },
    {
      "code": 6007,
      "name": "untrustedOracle",
      "msg": "The attestation was signed by a key other than this vault's configured oracle."
    },
    {
      "code": 6008,
      "name": "challengeWindowExpired",
      "msg": "The challenge window has already closed."
    },
    {
      "code": 6009,
      "name": "challengeWindowNotElapsed",
      "msg": "The challenge window has not elapsed yet."
    },
    {
      "code": 6010,
      "name": "invalidSplitBps",
      "msg": "seller_bps must be between 0 and 10000 inclusive."
    }
  ],
  "types": [
    {
      "name": "disputeResolved",
      "docs": [
        "Emitted on every resolution - the on-chain audit trail. `verdict_hash` is",
        "a SHA-256 (computed off-chain) of the full published verdict reasoning,",
        "so the ruling is tamper-evident without storing the reasoning text",
        "itself in account state."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "sellerBps",
            "type": "u16"
          },
          {
            "name": "verdictHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
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
          },
          {
            "name": "deliverySignaled"
          },
          {
            "name": "disputed"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "docs": [
        "Per-mint config naming the pubkey trusted to sign delivery attestations",
        "for `settle_order_with_oracle` **and** `signal_delivery` - the same",
        "trusted key signs two differently-tagged messages (see",
        "`DELIVERY_ATTESTATION_TAG` vs `DELIVERY_SIGNAL_TAG` in constants.rs) for",
        "two different instructions, so this config doesn't need to be",
        "duplicated. A separate, additive account rather than",
        "a new `UnifiedVault` field, so existing already-deployed vaults don't",
        "need to change layout to get this. In production this pubkey would be a",
        "registered Switchboard TEE enclave's attestation key; here it's just a",
        "configurable trusted signer, set once by the vault's authority."
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
            "name": "oraclePubkey",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
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
            "name": "kTokenShares",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "challengeDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "unifiedVault",
      "docs": [
        "Global, per-mint escrow custody account. One `UnifiedVault` holds every",
        "buyer's in-escrow principal for a given stablecoin mint, so orders don't",
        "each need their own token account.",
        "",
        "When `yield_enabled` is true, the `kamino_*` fields configure a specific",
        "Kamino Lend reserve that `fund_order_yield`/`settle_order_yield`/",
        "`refund_order_yield` route 75% of each order's principal through. These",
        "fields are trusted admin input (set once, by the vault's `authority`) -",
        "Kamino's own program independently validates them on every CPI, so a",
        "misconfigured value fails the CPI atomically rather than misdirecting",
        "funds."
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
            "name": "yieldEnabled",
            "type": "bool"
          },
          {
            "name": "kaminoProgram",
            "type": "pubkey"
          },
          {
            "name": "kaminoLendingMarket",
            "type": "pubkey"
          },
          {
            "name": "kaminoLendingMarketAuthority",
            "type": "pubkey"
          },
          {
            "name": "kaminoReserve",
            "type": "pubkey"
          },
          {
            "name": "kaminoReserveLiquiditySupply",
            "type": "pubkey"
          },
          {
            "name": "kaminoReserveCollateralMint",
            "type": "pubkey"
          },
          {
            "name": "kaminoPythOracle",
            "type": "pubkey"
          },
          {
            "name": "kaminoSwitchboardPriceOracle",
            "type": "pubkey"
          },
          {
            "name": "kaminoSwitchboardTwapOracle",
            "type": "pubkey"
          },
          {
            "name": "kaminoScopePrices",
            "type": "pubkey"
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
      "name": "oracleConfigSeed",
      "type": "bytes",
      "value": "[111, 114, 97, 99, 108, 101, 45, 99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "orderKtokenSeed",
      "type": "bytes",
      "value": "[111, 114, 100, 101, 114, 45, 107, 116, 111, 107, 101, 110]"
    },
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
