use aiken/collection/dict
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}
use cocktail.{inputs_with_policy}
use types.{ContributeFund, CrowdfundGovRedeemer, MintPolarity, RBurn, RMint}
use utils.{redeemer_with_input}

validator share_token(auth_token: PolicyId) {
  mint(redeemer: MintPolarity, policy_id: PolicyId, self: Transaction) {
    expect [Pair(_asset_name, quantity)] =
      self.mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()
    let Transaction { inputs, redeemers, .. } = self
    when redeemer is {
      RMint -> {
        expect [auth_token_input] = inputs_with_policy(inputs, auth_token)

        expect Some(auth_token_redeemer_data) =
          redeemer_with_input(redeemers, auth_token_input)

        expect auth_token_redeemer: CrowdfundGovRedeemer = auth_token_redeemer_data

        let redeemer_check = auth_token_redeemer == ContributeFund

        redeemer_check?
      }
      RBurn -> quantity < 0
    }
  }

  else(_) {
    fail
  }
}
