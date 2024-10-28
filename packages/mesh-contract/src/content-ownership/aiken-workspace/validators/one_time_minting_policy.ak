use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{Input, OutputReference, Transaction}
use content_ownership/types.{MintPolarity, RBurn, RMint}
use vodka_mints.{check_policy_only_burn}

validator one_time_minting_policy(utxo_ref: OutputReference) {
  mint(redeemer: MintPolarity, policy_id: PolicyId, tx: Transaction) {
    when redeemer is {
      RMint -> {
        let Transaction { inputs, .. } = tx
        let hash_equal =
          fn(input: Input) {
            let hash = input.output_reference
            utxo_ref == hash
          }
        let target_input_exist = list.find(inputs, hash_equal)
        when target_input_exist is {
          Some(_) -> True
          None -> False
        }
      }
      RBurn -> check_policy_only_burn(tx.mint, policy_id)
    }
  }

  else(_) {
    fail
  }
}
