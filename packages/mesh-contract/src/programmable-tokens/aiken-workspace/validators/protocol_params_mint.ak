use aiken/collection/list
// Protocol Parameters Minting Policy
// One-shot minting policy for the protocol parameters NFT
// Migrated from SmartTokens.Contracts.ProtocolParams
//
// This validator ensures:
// 1. The specified UTXO is consumed (one-shot minting)
// 2. Exactly one token is minted with the correct token name
// 3. The token is sent to an output with an inline datum containing ProgrammableLogicGlobalParams

use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use types.{ProgrammableLogicGlobalParams, protocol_params_token}

validator protocol_params_mint(utxo_ref: OutputReference) {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    // Check 1: This is a one-shot minting policy - must spend the specified UTXO
    let input_spent =
      list.any(self.inputs, fn(input) { input.output_reference == utxo_ref })

    // Check 2: Validate minted tokens - exactly 1 token with correct name
    let amount_minted =
      self.mint |> assets.quantity_of(policy_id, protocol_params_token)

    // Check 3: Ensure an output exists with the protocol params NFT and valid inline datum
    expect Some(output) =
      list.find(
        self.outputs,
        fn(output) {
          assets.quantity_of(output.value, policy_id, protocol_params_token) > 0
        },
      )
    expect InlineDatum(datum) = output.datum
    expect _params: ProgrammableLogicGlobalParams = datum

    and {
      input_spent?,
      (amount_minted == 1)?,
    }
  }

  else(_) {
    fail
  }
}
