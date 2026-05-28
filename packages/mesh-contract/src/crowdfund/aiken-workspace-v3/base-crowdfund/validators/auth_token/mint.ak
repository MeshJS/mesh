use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use types.{MintPolarity, RBurn, RMint}

validator auth_token(utxo_ref: OutputReference) {
  mint(redeemer: MintPolarity, policy_id: PolicyId, self: Transaction) {
    expect [Pair(_asset_name, quantity)] =
      self.mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()
    let Transaction { inputs, .. } = self
    when redeemer is {
      RMint -> {
        let is_output_consumed =
          list.any(inputs, fn(input) { input.output_reference == utxo_ref })
        is_output_consumed? && quantity == 1
      }
      RBurn -> quantity == -1
    }
  }

  else(_) {
    fail
  }
}
