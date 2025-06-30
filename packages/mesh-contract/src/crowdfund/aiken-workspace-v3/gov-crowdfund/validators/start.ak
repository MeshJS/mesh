use aiken/collection/pairs.{has_key}
use cardano/address.{Address, Credential, Inline, Script, from_script}
use cardano/assets.{PolicyId, lovelace_of}
use cardano/transaction.{Transaction}
use cocktail.{
  input_inline_datum, inputs_at, inputs_with_policy, output_inline_datum,
  outputs_at_with, policy_only_minted_token,
}
use crowdfund.{CompleteCrowdfund, CrowdfundRedeemer as ACrowdfundRedeemer}
use types.{
  CrowdfundDatum, CrowdfundGovDatum, CrowdfundRedeemer, Deregister,
  DeregisterCerts, Init, MintPolarity, PublishRedeemer, RBurn, RMint, Register,
  RegisterCerts, RemoveEmptyInstance, VoteOnGovAction,
}
use utils.{check_spend_script_input_redeemer, redeemer_with_input}

validator start(
  auth_token: PolicyId,
  spend: ByteArray,
  gov_action_period: Int,
) {
  withdraw(_r, account: Credential, self: Transaction) {
    let Transaction { inputs, outputs, mint, redeemers, .. } = self
    expect [auth_token_input] = inputs_with_policy(inputs, auth_token)
    expect auth_input_datum: CrowdfundDatum =
      input_inline_datum(auth_token_input)

    let CrowdfundDatum {
      completion_script,
      share_token,
      fundraise_target,
      deadline,
      current_fundraised_amount,
      ..
    } = auth_input_datum

    let completion_script_check = Script(completion_script) == account
    let gov_address =
      Address {
        payment_credential: Script(spend),
        stake_credential: Some(Inline(Script(completion_script))),
      }

    expect [fundraise_target_output] =
      outputs_at_with(outputs, gov_address, completion_script, "")

    let fundraise_output_lovelace_check =
      lovelace_of(fundraise_target_output.value) == fundraise_target
    expect fundraise_output_datum: CrowdfundGovDatum =
      output_inline_datum(fundraise_target_output)
    let fundraise_output_datum_check =
      fundraise_output_datum == Init {
        start_hash: completion_script,
        share_token,
        funds_controlled: current_fundraised_amount,
        deadline: deadline + gov_action_period,
      }

    expect Some(auth_token_input_redeemer_data) =
      redeemer_with_input(redeemers, auth_token_input)

    expect auth_token_input_redeemer: ACrowdfundRedeemer =
      auth_token_input_redeemer_data

    let auth_redeemer_check = auth_token_input_redeemer == CompleteCrowdfund
    completion_script_check? && fundraise_output_lovelace_check? && fundraise_output_datum_check? && policy_only_minted_token(
      mint,
      completion_script,
      "",
      1,
    )? && auth_redeemer_check?
  }

  mint(redeemer: MintPolarity, policy_id: PolicyId, self: Transaction) {
    let Transaction { withdrawals, inputs, redeemers, .. } = self
    when redeemer is {
      RMint -> {
        let withdrawal_credential: Credential = Script(policy_id)
        let withdrawal_script_check =
          withdrawals
            |> has_key(withdrawal_credential)

        withdrawal_script_check?
      }
      RBurn ->
        check_spend_script_input_redeemer(
          spend,
          inputs,
          redeemers,
          RemoveEmptyInstance,
        )?
    }
  }

  publish(redeemer: PublishRedeemer, _c, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    let spend_address = from_script(spend)
    expect [only_input] = inputs_at(inputs, spend_address)
    expect Some(only_inpuy_redeemer_data) =
      redeemer_with_input(redeemers, only_input)

    expect only_input_redeemer: CrowdfundRedeemer = only_inpuy_redeemer_data

    when redeemer is {
      Register -> {
        let redeemer_check = only_input_redeemer == RegisterCerts

        redeemer_check?
      }
      Deregister -> {
        let redeemer_check = only_input_redeemer == DeregisterCerts

        redeemer_check?
      }
    }
  }

  propose(_r, _p, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    check_spend_script_input_redeemer(spend, inputs, redeemers, RegisterCerts)?
  }

  vote(_r, _v, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    check_spend_script_input_redeemer(spend, inputs, redeemers, VoteOnGovAction)?
  }

  else(_) {
    fail
  }
}
