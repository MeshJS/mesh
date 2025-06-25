use cardano/address.{Address, Credential, Inline, Script}
use cardano/assets.{PolicyId, lovelace_of}
use cardano/transaction.{Transaction}
use cocktail.{
  input_inline_datum, inputs_with_policy, output_inline_datum, outputs_at,
}
use types.{CrowdfundDatum, CrowdfundGovDatum, Init}

validator start(
  auth_token: PolicyId,
  spend: ByteArray,
  stake: ByteArray,
  gov_action_period: Int,
) {
  withdraw(_r, account: Credential, self: Transaction) {
    let Transaction { inputs, outputs, .. } = self

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
        stake_credential: Some(Inline(Script(stake))),
      }

    expect [fundraise_target_output] = outputs_at(outputs, gov_address)

    let fundraise_output_lovelace_check =
      lovelace_of(fundraise_target_output.value) == fundraise_target
    expect fundraise_output_datum: CrowdfundGovDatum =
      output_inline_datum(fundraise_target_output)
    let fundraise_output_datum_check =
      fundraise_output_datum == Init {
        completion_script,
        share_token,
        funds_controlled: current_fundraised_amount,
        deadline: deadline + gov_action_period,
      }
    completion_script_check? && fundraise_output_lovelace_check? && fundraise_output_datum_check?
  }

  else(_) {
    fail
  }
}
