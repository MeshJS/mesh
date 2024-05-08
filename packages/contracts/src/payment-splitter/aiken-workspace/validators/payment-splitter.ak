use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/option
use aiken/transaction.{
  Input, NoDatum, Output, OutputReference, ScriptContext, Spend, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{
  Address, VerificationKey, VerificationKeyCredential,
}
use aiken/transaction/value.{from_lovelace, lovelace_of}

type Datum {
  owner: Hash<Blake2b_224, VerificationKey>,
}

type Redeemer {
  message: ByteArray,
}

validator(scriptHashes: List<ByteArray>) {
  fn payout(_datum: Datum, _redeemer: Redeemer, context: ScriptContext) -> Bool {
    let payees = list.map(scriptHashes, fn(x) { VerificationKeyCredential(x) })

    let Transaction { outputs, inputs, fee, .. } = context.transaction

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
            let change = payeeInputSum - lovelace_of(fee)
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
}

test should_split_equally() {
  let datum =
    Datum { owner: #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406" }
  let placeholder_utxo =
    OutputReference { transaction_id: TransactionId(""), output_index: 0 }
  let context =
    ScriptContext {
      purpose: Spend(placeholder_utxo),
      transaction: transaction.placeholder()
        |> fn(transaction) {
            Transaction {
              ..transaction,
              fee: from_lovelace(846025),
              inputs: [
                Input {
                  output_reference: OutputReference {
                    transaction_id: TransactionId(""),
                    output_index: 0,
                  },
                  output: Output {
                    address: Address {
                      payment_credential: VerificationKeyCredential(
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
                    transaction_id: TransactionId(""),
                    output_index: 0,
                  },
                  output: Output {
                    address: Address {
                      payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
          },
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

  payout(scriptHashes, datum, redeemer, context)
}

test payment_splitter_should_fail() fail {
  let datum =
    Datum { owner: #"52bd00e69e371daa373c021c3f4321356902016c320e41526e239406" }
  let placeholder_utxo =
    OutputReference { transaction_id: TransactionId(""), output_index: 0 }
  let context =
    ScriptContext {
      purpose: Spend(placeholder_utxo),
      transaction: transaction.placeholder()
        |> fn(transaction) {
            Transaction {
              ..transaction,
              fee: from_lovelace(846025),
              inputs: [
                Input {
                  output_reference: OutputReference {
                    transaction_id: TransactionId(""),
                    output_index: 0,
                  },
                  output: Output {
                    address: Address {
                      payment_credential: VerificationKeyCredential(
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
                    transaction_id: TransactionId(""),
                    output_index: 0,
                  },
                  output: Output {
                    address: Address {
                      payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
                    payment_credential: VerificationKeyCredential(
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
          },
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

  payout(scriptHashes, datum, redeemer, context)
}
