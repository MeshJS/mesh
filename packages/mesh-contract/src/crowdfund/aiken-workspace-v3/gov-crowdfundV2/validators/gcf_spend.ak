use cardano/address.{Address, Inline, Script}
use cardano/assets.{Lovelace, PolicyId, lovelace_of}
use cardano/certificate.{Registered}
use cardano/governance.{DelegateRepresentative, GovernanceActionId}
use cardano/transaction.{Output, OutputReference, Transaction, find_input}
use cocktail.{
  inputs_at_with, inputs_at_with_policy, key_signed, only_minted_token,
  output_inline_datum, outputs_at_with, outputs_at_with_policy,
  policy_only_minted_token, valid_after, valid_before, value_length,
}
use gov.{VGovernanceAction}
use types.{
  AfterCompleteContributorWithdrawal, AfterCompleteRemoveEmptyInstance,
  CompleteCrowdfund, ContributeFund, Crowdfund, CrowdfundGovDatum,
  CrowdfundGovRedeemer, DeregisterCerts, PreMatureContributorWithdrawal,
  PreMatureRemoveEmptyInstance, Proposed, Refundable, RegisterCerts,
  VoteOnGovAction, Voted,
}
use utils.{
  check_fundraise_target, check_lovelace_diff, check_proposal_procedure,
  check_vote, delegate_stake_and_vote_certificate, delegate_stake_certificate,
  delegate_vote_certificate, register_drep_certificate,
  register_stake_certificate, unregister_drep_certificate,
  unregister_stake_certificate,
}

// Unified spending validator handling both crowdfunding and governance operations
validator gCf_spend(
  auth_token: PolicyId,
  proposer_key_hash: ByteArray,
  gov_action: VGovernanceAction,
  delegate_pool_id: ByteArray,
  // dynamic deposit parameters to avoid hardcoding values
  stake_register_deposit: Lovelace,
  drep_register_deposit: Lovelace,
  gov_deposit: Lovelace,
) {
  spend(
    datum_opt: Option<CrowdfundGovDatum>,
    redeemer: CrowdfundGovRedeemer,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction {
      inputs,
      validity_range,
      mint,
      outputs,
      extra_signatories,
      certificates,
      proposal_procedures,
      votes,
      ..
    } = self

    expect Some(own_input) = find_input(inputs, input)
    expect Some(auth_input_datum) = datum_opt

    let current_address = own_input.output.address

    // check only 1 auth token input from current address
    expect [auth_input] =
      inputs_at_with_policy(inputs, current_address, auth_token)

    when redeemer is {
      // Crowdfunding: Add funds to active campaign, mint proportional share tokens
      ContributeFund ->
        when auth_input_datum is {
          Crowdfund {
            stake_hash,
            share_token,
            crowdfund_address,
            fundraise_target,
            current_fundraised_amount: input_current_fundraised_amount,
            allow_over_subscription,
            deadline,
            expiry_buffer,
            min_charge,
          } -> {
            expect [auth_output] =
              outputs_at_with_policy(outputs, current_address, auth_token)

            let lovelace_from_auth_input =
              auth_input.output.value |> lovelace_of()
            let lovelace_from_auth_output = auth_output.value |> lovelace_of()
            expect auth_output_datum_raw: CrowdfundGovDatum =
              output_inline_datum(auth_output)

            when auth_output_datum_raw is {
              Crowdfund {
                current_fundraised_amount: output_current_fundraised_amount,
                ..
              } -> {
                let fundraise_added =
                  lovelace_from_auth_output - lovelace_from_auth_input
                let fundraise_check =
                  (fundraise_added == output_current_fundraised_amount - input_current_fundraised_amount)? && (fundraise_added >= 2000000)?

                let fundraise_target_check =
                  check_fundraise_target(
                    allow_over_subscription,
                    fundraise_target,
                    output_current_fundraised_amount,
                  )

                let validity_check = valid_before(validity_range, deadline)

                let output_datum_check =
                  auth_output_datum_raw == Crowdfund {
                    stake_hash,
                    share_token,
                    crowdfund_address,
                    fundraise_target,
                    current_fundraised_amount: input_current_fundraised_amount + fundraise_added,
                    allow_over_subscription,
                    deadline,
                    expiry_buffer,
                    min_charge,
                  }

                let is_auth_output_value_clean =
                  value_length(auth_output.value) == 2
                fundraise_check? && fundraise_target_check? && validity_check? && output_datum_check? && is_auth_output_value_clean? && only_minted_token(
                  mint,
                  share_token,
                  "",
                  fundraise_added,
                )?
              }
              _ -> False
            }
          }
          _ -> False
        }

      // Crowdfunding: Withdraw funds before completion (failed campaign or expired)
      PreMatureContributorWithdrawal ->
        when auth_input_datum is {
          Crowdfund {
            stake_hash,
            share_token,
            crowdfund_address,
            fundraise_target,
            current_fundraised_amount: input_current_fundraised_amount,
            allow_over_subscription,
            deadline,
            expiry_buffer,
            min_charge,
          } -> {
            let validity_check =
              valid_after(validity_range, deadline + expiry_buffer)
            let fund_check = input_current_fundraised_amount <= fundraise_target

            expect [auth_output] =
              outputs_at_with_policy(outputs, current_address, auth_token)

            let lovelace_from_auth_input =
              auth_input.output.value |> lovelace_of()
            let lovelace_from_auth_output = auth_output.value |> lovelace_of()

            let lovelace_withdrawn =
              lovelace_from_auth_output - lovelace_from_auth_input

            let lovelace_withdrawn_check = lovelace_withdrawn < 0

            expect auth_output_datum_raw: CrowdfundGovDatum =
              output_inline_datum(auth_output)
            when auth_output_datum_raw is {
              Crowdfund { current_fundraised_amount: _, .. } -> {
                let output_datum_check =
                  auth_output_datum_raw == Crowdfund {
                    stake_hash,
                    share_token,
                    crowdfund_address,
                    fundraise_target,
                    current_fundraised_amount: input_current_fundraised_amount + lovelace_withdrawn,
                    allow_over_subscription,
                    deadline,
                    expiry_buffer,
                    min_charge,
                  }

                let is_auth_output_value_clean =
                  value_length(auth_output.value) == 2
                (validity_check || fund_check)? && lovelace_withdrawn_check? && output_datum_check? && is_auth_output_value_clean? && only_minted_token(
                  mint,
                  share_token,
                  "",
                  lovelace_withdrawn,
                )?
              }
              _ -> False
            }
          }
          _ -> False
        }
      // Crowdfunding: Remove empty instance after deadline, burn tokens
      PreMatureRemoveEmptyInstance ->
        when auth_input_datum is {
          Crowdfund { share_token, current_fundraised_amount, deadline, .. } -> {
            let validity_check = valid_after(validity_range, deadline)

            let token_burnt_check =
              if current_fundraised_amount > 0 {
                policy_only_minted_token(
                  mint,
                  share_token,
                  "",
                  -current_fundraised_amount,
                )? && policy_only_minted_token(mint, auth_token, "", -1)?
              } else {
                only_minted_token(mint, auth_token, "", -1)?
              }
            let proposer_key_signed_check =
              key_signed(extra_signatories, proposer_key_hash)
            validity_check? && token_burnt_check? && proposer_key_signed_check?
          }
          _ -> False
        }

      // Governance: Register certificates, delegate, submit proposal (Crowdfund → Proposed)
      RegisterCerts ->
        when auth_input_datum is {
          Crowdfund {
            stake_hash,
            share_token,
            current_fundraised_amount,
            deadline,
            ..
          } -> {
            // check only 1 input with token from current address
            expect [only_input] =
              inputs_at_with(inputs, current_address, auth_token, "")
            expect Some(current_stake_credential) =
              current_address.stake_credential

            expect Inline(current_credential) = current_stake_credential

            expect [only_output] =
              outputs_at_with(outputs, current_address, auth_token, "")

            let lovelace_check =
              check_lovelace_diff(
                only_input,
                only_output,
                -(stake_register_deposit + drep_register_deposit + gov_deposit),
              )
            expect only_output_datum: CrowdfundGovDatum =
              output_inline_datum(only_output)
            let output_datum_check =
              only_output_datum == Proposed {
                stake_hash,
                share_token,
                funds_controlled: current_fundraised_amount,
                deadline,
              }

            let is_only_output_value_clean =
              value_length(only_output.value) == 2

            let reg_stake_cert_check =
              register_stake_certificate(certificates, current_credential)

            let reg_drep_cert_check =
              register_drep_certificate(
                certificates,
                current_credential,
                drep_register_deposit,
              )

            let delegate_check =
              delegate_vote_certificate(
                certificates,
                current_credential,
                Registered(current_credential),
              ) && delegate_stake_certificate(
                certificates,
                current_credential,
                delegate_pool_id,
              ) || delegate_stake_and_vote_certificate(
                certificates,
                current_credential,
                delegate_pool_id,
                Registered(current_credential),
              )

            let proposal_check =
              check_proposal_procedure(
                proposal_procedures,
                gov_deposit,
                Script(stake_hash),
                gov_action,
              )
            lovelace_check? && output_datum_check? && is_only_output_value_clean? && reg_stake_cert_check? && reg_drep_cert_check? && delegate_check? && proposal_check?
          }
          _ -> False
        }
      // Governance: Record vote on proposal (Proposed → Voted)
      VoteOnGovAction ->
        when auth_input_datum is {
          Proposed { stake_hash, share_token, funds_controlled, deadline } -> {
            // check only 1 input with authtoken residing at current address 
            expect [only_input] =
              inputs_at_with(inputs, current_address, auth_token, "")
            expect [only_output] =
              outputs_at_with(outputs, current_address, auth_token, "")

            let value_check = only_input.output.value == only_output.value
            expect only_output_datum: CrowdfundGovDatum =
              output_inline_datum(only_output)
            let gov_tx_id =
              GovernanceActionId {
                transaction: own_input.output_reference.transaction_id,
                proposal_procedure: 0,
              }
            let output_datum_check =
              only_output_datum == Voted {
                stake_hash,
                share_token,
                funds_controlled,
                gov_tx_id,
                deadline,
              }

            let is_only_output_value_clean =
              value_length(only_output.value) == 2

            value_check? && output_datum_check? && is_only_output_value_clean? && check_vote(
              votes,
              DelegateRepresentative(Script(stake_hash)),
              gov_tx_id,
            )
          }
          _ -> False
        }
      // Governance: Deregister certificates after governance period (Voted → Refundable)
      DeregisterCerts ->
        when auth_input_datum is {
          Voted { stake_hash, share_token, funds_controlled, deadline, .. } -> {
            // check only 1 input with token from current address
            expect [only_input] =
              inputs_at_with(inputs, current_address, auth_token, "")
            expect Some(current_stake_credential) =
              current_address.stake_credential

            expect Inline(current_credential) = current_stake_credential
            let validity_check = valid_after(validity_range, deadline)
            expect [only_output] =
              outputs_at_with(outputs, current_address, auth_token, "")
            let lovelace_check =
              check_lovelace_diff(
                only_input,
                only_output,
                stake_register_deposit + drep_register_deposit + gov_deposit,
              )

            expect only_output_datum: CrowdfundGovDatum =
              output_inline_datum(only_output)
            let output_datum_check =
              only_output_datum == Refundable {
                stake_hash,
                share_token,
                funds_controlled,
              }

            let unreg_stake_cert_check =
              unregister_stake_certificate(certificates, current_credential)

            let unreg_drep_cert_check =
              unregister_drep_certificate(
                certificates,
                current_credential,
                drep_register_deposit,
              )

            let is_only_output_value_clean =
              value_length(only_output.value) == 2
            validity_check? && lovelace_check? && output_datum_check? && unreg_stake_cert_check? && unreg_drep_cert_check? && is_only_output_value_clean?
          }

          _ -> False
        }

      // Post-governance: Withdraw funds by burning share tokens
      AfterCompleteContributorWithdrawal ->
        when auth_input_datum is {
          Refundable { stake_hash, share_token, funds_controlled } -> {
            // check only 1 input with token from current address
            expect [only_input] =
              inputs_at_with(inputs, current_address, auth_token, "")
            expect [only_output] =
              outputs_at_with(outputs, current_address, auth_token, "")

            let lovelace_from_only_input =
              only_input.output.value |> lovelace_of()
            let lovelace_from_only_output = only_output.value |> lovelace_of()

            let lovelace_withdrawn =
              lovelace_from_only_output - lovelace_from_only_input

            let lovelace_withdrawn_check = lovelace_withdrawn < 0

            expect only_output_datum: CrowdfundGovDatum =
              output_inline_datum(only_output)
            let output_datum_check =
              only_output_datum == Refundable {
                stake_hash,
                share_token,
                funds_controlled: funds_controlled + lovelace_withdrawn,
              }

            let is_only_output_value_clean =
              value_length(only_output.value) == 2

            lovelace_withdrawn_check? && output_datum_check? && is_only_output_value_clean? && only_minted_token(
              mint,
              share_token,
              "",
              lovelace_withdrawn,
            )?
          }
          _ -> False
        }

      // CompleteCrowdfund - Not implemented in gov-crowdfundV2 (uses governance flow instead)
      CompleteCrowdfund -> False

      // Post-governance: Remove empty instance after all funds withdrawn
      AfterCompleteRemoveEmptyInstance ->
        when auth_input_datum is {
          Refundable { stake_hash, share_token, funds_controlled } -> {
            // check only 1 input with token from current address
            expect [_] = inputs_at_with(inputs, current_address, stake_hash, "")
            let token_burnt_check =
              if funds_controlled > 0 {
                policy_only_minted_token(
                  mint,
                  share_token,
                  "",
                  -funds_controlled,
                )
              } else {
                True
              }

            let proposer_key_signed_check =
              key_signed(extra_signatories, proposer_key_hash)
            token_burnt_check? && proposer_key_signed_check? && policy_only_minted_token(
              mint,
              auth_token,
              "",
              -1,
            )?
          }
          _ -> False
        }
    }
  }

  else(_) {
    fail
  }
}
