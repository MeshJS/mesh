use aiken/collection/list.{delete}
use aiken/collection/pairs.{has_key}
use cardano/address.{Credential, Script}
use cardano/assets.{
  PolicyId, from_lovelace, lovelace_of, merge, policies, restricted_to,
}
use cardano/transaction.{OutputReference, Transaction, find_input}
use cocktail.{
  inputs_at_with_policy, only_minted_token, output_inline_datum,
  outputs_at_with_policy, policy_only_minted_token, valid_after, valid_before,
  value_length,
}
use types.{
  CompleteCrowdfund, ContributeFund, ContributorWithdrawal, CrowdfundDatum,
  CrowdfundRedeemer, RemoveEmptyInstance,
}
use utils.{check_fundraise_target, output_at_with_value}

validator crowdfund(auth_token: PolicyId) {
  spend(
    datum_opt: Option<CrowdfundDatum>,
    redeemer: CrowdfundRedeemer,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction { inputs, validity_range, mint, outputs, withdrawals, .. } =
      self

    expect Some(own_input) = find_input(inputs, input)
    expect Some(auth_input_datum) = datum_opt

    let current_address = own_input.output.address

    // check only 1 auth toke input from current address
    expect [auth_input] =
      inputs_at_with_policy(inputs, current_address, auth_token)

    let CrowdfundDatum {
      current_fundraised_amount,
      fundraise_target,
      allow_over_subscription,
      deadline,
      completion_script,
      share_token,
      min_charge,
      fee_address,
      expiry_buffer,
      ..
    } = auth_input_datum
    when redeemer is {
      ContributeFund -> {
        expect [auth_output] =
          outputs_at_with_policy(outputs, current_address, auth_token)

        let lovelace_from_auth_input = auth_input.output.value |> lovelace_of()
        let lovelace_from_auth_output = auth_output.value |> lovelace_of()
        expect auth_output_datum: CrowdfundDatum =
          output_inline_datum(auth_output)

        let fundraise_added =
          lovelace_from_auth_output - lovelace_from_auth_input
        let fundraise_check =
          (fundraise_added == auth_output_datum.current_fundraised_amount - current_fundraised_amount)? && (fundraise_added >= 2000000)?

        let fundraise_target_check =
          check_fundraise_target(
            allow_over_subscription,
            fundraise_target,
            auth_output_datum.current_fundraised_amount,
          )

        let validity_check = valid_before(validity_range, deadline)

        let output_datum_check =
          auth_output_datum == CrowdfundDatum {
            ..auth_input_datum,
            current_fundraised_amount: current_fundraised_amount + fundraise_added,
          }

        let is_auth_output_value_clean = value_length(auth_output.value) == 2
        fundraise_check? && fundraise_target_check? && validity_check? && output_datum_check? && is_auth_output_value_clean? && only_minted_token(
          mint,
          share_token,
          completion_script,
          fundraise_added,
        )?
      }

      CompleteCrowdfund -> {
        let fee_value =
          from_lovelace(
            lovelace_of(auth_input.output.value) - current_fundraised_amount - min_charge,
          )

        let other_policy =
          policies(auth_input.output.value)
            |> delete(auth_token)
            |> delete("")
        let other_value = restricted_to(auth_input.output.value, other_policy)

        expect [_] =
          output_at_with_value(
            outputs,
            fee_address,
            merge(other_value, fee_value),
          )

        let fundraise_check = current_fundraised_amount >= fundraise_target
        let completion_script_withdrawal_credential: Credential =
          Script(completion_script)
        let withdrawal_script_check =
          withdrawals
            |> has_key(completion_script_withdrawal_credential)
        fundraise_check? && withdrawal_script_check? && only_minted_token(
          mint,
          auth_token,
          completion_script,
          -1,
        )?
      }

      ContributorWithdrawal -> {
        let validity_check =
          valid_after(validity_range, deadline + expiry_buffer)
        let fund_check = current_fundraised_amount <= fundraise_target

        expect [auth_output] =
          outputs_at_with_policy(outputs, current_address, auth_token)

        let lovelace_from_auth_input = auth_input.output.value |> lovelace_of()
        let lovelace_from_auth_output = auth_output.value |> lovelace_of()

        let lovelace_withdrawn =
          lovelace_from_auth_output - lovelace_from_auth_input

        let lovelace_withdrawn_check = lovelace_withdrawn < 0

        expect auth_output_datum: CrowdfundDatum =
          output_inline_datum(auth_output)
        let output_datum_check =
          auth_output_datum == CrowdfundDatum {
            ..auth_input_datum,
            current_fundraised_amount: current_fundraised_amount + lovelace_withdrawn,
          }

        let is_auth_output_value_clean = value_length(auth_output.value) == 2
        (validity_check || fund_check)? && lovelace_withdrawn_check? && output_datum_check? && is_auth_output_value_clean? && only_minted_token(
          mint,
          share_token,
          completion_script,
          lovelace_withdrawn,
        )?
      }

      RemoveEmptyInstance -> {
        let validity_check = valid_after(validity_range, deadline)

        let token_burnt_check =
          if current_fundraised_amount > 0 {
            policy_only_minted_token(
              mint,
              share_token,
              completion_script,
              -current_fundraised_amount,
            )? && policy_only_minted_token(
              mint,
              auth_token,
              completion_script,
              -1,
            )?
          } else {
            only_minted_token(mint, auth_token, completion_script, -1)?
          }
        validity_check? && token_burnt_check?
      }
    }
  }

  else(_) {
    fail
  }
}
