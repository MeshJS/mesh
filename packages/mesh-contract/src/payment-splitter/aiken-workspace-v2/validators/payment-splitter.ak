use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/option
use cardano/address.{Address, VerificationKey}
use cardano/assets.{from_lovelace, lovelace_of}
use cardano/transaction.{Input, NoDatum, Output, OutputReference, Transaction}
use mocktail/virgin_output_reference.{mock_utxo_ref}

pub type Datum {
  owner: VerificationKeyHash,
}

pub type Redeemer {
  message: ByteArray,
}

validator payout(scriptHashes: List<ByteArray>) {
  spend(
    _datum: Option<Datum>,
    _redeemer: Redeemer,
    _input: OutputReference,
    tx: Transaction,
  ) {
    let payees = list.map(scriptHashes, fn(x) { VerificationKey(x) })

    let Transaction { outputs, inputs, fee, .. } = tx

    let outputCredentials =
      list.map(outputs, fn(output) { output.address.payment_credential })

    // Only the payees are allowed to trigger the payout and the list needs to include all payees
    let hasNoAdditionalPayees =
      list.difference(list.unique(outputCredentials), payees) == []

    // All payees must receive the same amount but the payee that triggered the payout
    // must receive the sum of its own inputs minus the fee back to itself on top of that
    let outputValues =
      list.map(
        payees,
        fn(payee) {
          let payeeOutputs =
            list.filter(
              outputs,
              fn(output) { output.address.payment_credential == payee },
            )

          let payeeOutputSum =
            list.foldr(
              payeeOutputs,
              0,
              fn(output, acc) { acc + lovelace_of(output.value) },
            )

          let payeeInput =
            list.filter(
              inputs,
              fn(input) { input.output.address.payment_credential == payee },
            )

          let payeeInputSum =
            list.foldr(
              payeeInput,
              0,
              fn(input, acc) { acc + lovelace_of(input.output.value) },
            )

          if payeeInputSum > 0 {
            // The payee must receive the sum of its own inputs minus the fee back to itself
            let change = payeeInputSum - fee
            payeeOutputSum - change
          } else {
            payeeOutputSum
          }
        },
      )
    let isSplitEqually =
      list.all(
        outputValues,
        fn(value) {
          let firstOutputValue = option.or_else(list.head(outputValues), 0)
          value == firstOutputValue
        },
      )

    hasNoAdditionalPayees && isSplitEqually
  }

  else(_) {
    fail
  }
}

test should_split_equally() {
  let datum =
    Datum { owner: #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406" }
  let placeholder_utxo = mock_utxo_ref(0, 0)
  let tx =
    transaction.placeholder
      |> fn(transaction) {
          Transaction {
            ..transaction,
            fee: 846025,
            inputs: [
              Input {
                output_reference: OutputReference {
                  transaction_id: "",
                  output_index: 0,
                },
                output: Output {
                  address: Address {
                    payment_credential: VerificationKey(
                      #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                    ),
                    stake_credential: None,
                  },
                  value: from_lovelace(41961442),
                  datum: NoDatum,
                  reference_script: None,
                },
              },
              Input {
                output_reference: OutputReference {
                  transaction_id: "",
                  output_index: 0,
                },
                output: Output {
                  address: Address {
                    payment_credential: VerificationKey(
                      #"29ab97f98df7b26c5bfea0c68a727194eca3a14fe41bbe640bce1b8c",
                    ),
                    stake_credential: None,
                  },
                  value: from_lovelace(15000000),
                  datum: NoDatum,
                  reference_script: None,
                },
              },
            ],
            outputs: [
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(3000000),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(41115417),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"3cea9e9f66482d00cdacd2087d27173d534b76ce7e3cc86e8a07f434",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(3000000),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"01f3855a5b36569e6ce1bdd8286f2b8b4e764b0e1a90a3e3d8357490",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(3000000),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"ce63d3ad78867ac366cabe17e3f15f76d05e0f99827986f92413c4d8",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(3000000),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"06cae4f91a7e73521cfb42a0dcfe0d90feff52ffa096467995bfb503",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(3000000),
                datum: NoDatum,
                reference_script: None,
              },
            ],
            extra_signatories: [
              #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406",
            ],
          }
        }

  let redeemer = Redeemer { message: "Payday" }

  let scriptHashes =
    [
      #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
      #"3cea9e9f66482d00cdacd2087d27173d534b76ce7e3cc86e8a07f434",
      #"01f3855a5b36569e6ce1bdd8286f2b8b4e764b0e1a90a3e3d8357490",
      #"ce63d3ad78867ac366cabe17e3f15f76d05e0f99827986f92413c4d8",
      #"06cae4f91a7e73521cfb42a0dcfe0d90feff52ffa096467995bfb503",
    ]

  payout.spend(scriptHashes, Some(datum), redeemer, placeholder_utxo, tx)
}

test payment_splitter_should_fail() fail {
  let datum =
    Datum { owner: #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406" }
  let placeholder_utxo = mock_utxo_ref(0, 0)
  let tx =
    transaction.placeholder
      |> fn(transaction) {
          Transaction {
            ..transaction,
            fee: 846025,
            inputs: [
              Input {
                output_reference: OutputReference {
                  transaction_id: "",
                  output_index: 0,
                },
                output: Output {
                  address: Address {
                    payment_credential: VerificationKey(
                      #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                    ),
                    stake_credential: None,
                  },
                  value: from_lovelace(41961442),
                  datum: NoDatum,
                  reference_script: None,
                },
              },
              Input {
                output_reference: OutputReference {
                  transaction_id: "",
                  output_index: 0,
                },
                output: Output {
                  address: Address {
                    payment_credential: VerificationKey(
                      #"29ab97f98df7b26c5bfea0c68a727194eca3a14fe41bbe640bce1b8c",
                    ),
                    stake_credential: None,
                  },
                  value: from_lovelace(16000000),
                  datum: NoDatum,
                  reference_script: None,
                },
              },
            ],
            outputs: [
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(8000000),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(41115417),
                datum: NoDatum,
                reference_script: None,
              },
              Output {
                address: Address {
                  payment_credential: VerificationKey(
                    #"3cea9e9f66482d00cdacd2087d27173d534b76ce7e3cc86e8a07f434",
                  ),
                  stake_credential: None,
                },
                value: from_lovelace(8000000),
                datum: NoDatum,
                reference_script: None,
              },
            ],
            extra_signatories: [
              #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406",
            ],
          }
        }

  let redeemer = Redeemer { message: "Payday" }

  let scriptHashes =
    [
      #"92e2ae51fb03dcc55c471506fe35bdedad9c266b0d09c2b8bc7cb445",
      #"3cea9e9f66482d00cdacd2087d27173d534b76ce7e3cc86e8a07f434",
      #"01f3855a5b36569e6ce1bdd8286f2b8b4e764b0e1a90a3e3d8357490",
      #"ce63d3ad78867ac366cabe17e3f15f76d05e0f99827986f92413c4d8",
      #"06cae4f91a7e73521cfb42a0dcfe0d90feff52ffa096467995bfb503",
    ]

  payout.spend(scriptHashes, Some(datum), redeemer, placeholder_utxo, tx)
}
