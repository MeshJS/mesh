// use aiken/collection/list
// use cardano/address.{Inline}
// use cardano/assets.{Lovelace, lovelace_of}
// use cardano/certificate.{Registered}
// use cardano/governance.{GovernanceAction, ProposalProcedure}
// use cardano/transaction.{OutputReference, Transaction, find_input}
// use cocktail.{
//   inputs_at, key_signed, only_minted_token, output_inline_datum, outputs_at,
//   valid_after, value_length,
// }
// use types.{
//   ContributorWithdrawal, CrowdfundGovDatum, CrowdfundRedeemer, DeregisterCerts,
//   Init, Proposed, Refundable, RegisterCerts, RemoveEmptyInstance,
// }
// use utils.{
//   check_lovelace_diff, delegate_stake_and_vote_certificate,
//   delegate_stake_certificate, delegate_vote_certificate,
//   register_drep_certificate, register_stake_certificate,
//   unregister_drep_certificate, unregister_stake_certificate,
// }

// validator spend(
//   delegate_pool_id: ByteArray,
//   gov_action: GovernanceAction,
//   proposer_key_hash: ByteArray,
//   stake_register_deposit: Lovelace,
//   drep_register_deposit: Lovelace,
// ) {
//   spend(
//     datum_opt: Option<CrowdfundGovDatum>,
//     redeemer: CrowdfundRedeemer,
//     input: OutputReference,
//     self: Transaction,
//   ) {
//     let Transaction {
//       inputs,
//       validity_range,
//       mint,
//       outputs,
//       extra_signatories,
//       certificates,
//       proposal_procedures,
//       ..
//     } = self

//     expect Some(own_input) = find_input(inputs, input)
//     expect Some(only_input_datum) = datum_opt

//     let current_address = own_input.output.address

//     // check only 1 input from current address
//     expect [only_input] = inputs_at(inputs, current_address)

//     when redeemer is {
//       RegisterCerts ->
//         when only_input_datum is {
//           Init { share_token, deadline, funds_controlled, completion_script } -> {
//             expect Some(current_stake_credential) =
//               current_address.stake_credential

//             expect Inline(current_credential) = current_stake_credential

//             expect [only_output] = outputs_at(outputs, current_address)

//             let lovelace_from_only_input =
//               only_input.output.value |> lovelace_of()

//             let lovelace_check =
//               check_lovelace_diff(
//                 only_input,
//                 only_output,
//                 -(stake_register_deposit + drep_register_deposit),
//               )
//             expect only_output_datum: CrowdfundGovDatum =
//               output_inline_datum(only_output)
//             let output_datum_check =
//               only_output_datum == Proposed {
//                 completion_script,
//                 share_token,
//                 funds_controlled,
//                 deadline,
//               }

//             let is_only_output_value_clean =
//               value_length(only_output.value) == 1

//             let reg_stake_cert_check =
//               register_stake_certificate(certificates, current_credential)

//             let reg_drep_cert_check =
//               register_drep_certificate(
//                 certificates,
//                 current_credential,
//                 drep_register_deposit,
//               )

//             let delegate_check =
//               delegate_vote_certificate(
//                 certificates,
//                 current_credential,
//                 Registered(current_credential),
//               ) && delegate_stake_certificate(
//                 certificates,
//                 current_credential,
//                 delegate_pool_id,
//               ) || delegate_stake_and_vote_certificate(
//                 certificates,
//                 current_credential,
//                 delegate_pool_id,
//                 Registered(current_credential),
//               )

//             let proposal_check =
//               list.has(
//                 proposal_procedures,
//                 ProposalProcedure {
//                   deposit: lovelace_from_only_input - stake_register_deposit - drep_register_deposit,
//                   return_address: current_address.payment_credential,
//                   governance_action: gov_action,
//                 },
//               )
//             lovelace_check? && output_datum_check? && is_only_output_value_clean? && reg_stake_cert_check? && reg_drep_cert_check? && delegate_check? && proposal_check?
//           }
//           _ -> False
//         }

//       DeregisterCerts ->
//         when only_input_datum is {
//           Refundable {
//             share_token,
//             deadline,
//             funds_controlled,
//             completion_script,
//           } -> {
//             expect Some(current_stake_credential) =
//               current_address.stake_credential

//             expect Inline(current_credential) = current_stake_credential
//             let validity_check = valid_after(validity_range, deadline)
//             expect [only_output] = outputs_at(outputs, current_address)
//             let lovelace_check =
//               check_lovelace_diff(
//                 only_input,
//                 only_output,
//                 stake_register_deposit + drep_register_deposit,
//               )

//             expect only_output_datum: CrowdfundGovDatum =
//               output_inline_datum(only_output)
//             let output_datum_check =
//               only_output_datum == Refundable {
//                 completion_script,
//                 share_token,
//                 funds_controlled,
//                 deadline,
//               }

//             let unreg_stake_cert_check =
//               unregister_stake_certificate(certificates, current_credential)

//             let unreg_drep_cert_check =
//               unregister_drep_certificate(
//                 certificates,
//                 current_credential,
//                 drep_register_deposit,
//               )
//             validity_check? && lovelace_check? && output_datum_check? && unreg_stake_cert_check? && unreg_drep_cert_check?
//           }

//           _ -> False
//         }

//       ContributorWithdrawal ->
//         when only_input_datum is {
//           Refundable {
//             share_token,
//             deadline,
//             funds_controlled,
//             completion_script,
//           } -> {
//             let validity_check = valid_after(validity_range, deadline)

//             expect [only_output] = outputs_at(outputs, current_address)

//             let lovelace_from_only_input =
//               only_input.output.value |> lovelace_of()
//             let lovelace_from_only_output = only_output.value |> lovelace_of()

//             let lovelace_withdrawn =
//               lovelace_from_only_output - lovelace_from_only_input

//             let lovelace_withdrawn_check = lovelace_withdrawn < 0

//             expect only_output_datum: CrowdfundGovDatum =
//               output_inline_datum(only_output)
//             let output_datum_check =
//               only_output_datum == Refundable {
//                 completion_script,
//                 share_token,
//                 funds_controlled: funds_controlled + lovelace_withdrawn,
//                 deadline,
//               }

//             let is_only_output_value_clean =
//               value_length(only_output.value) == 1

//             validity_check? && lovelace_withdrawn_check? && output_datum_check? && is_only_output_value_clean? && only_minted_token(
//               mint,
//               share_token,
//               completion_script,
//               lovelace_withdrawn,
//             )?
//           }
//           _ -> False
//         }

//       RemoveEmptyInstance ->
//         when only_input_datum is {
//           Refundable {
//             share_token,
//             deadline,
//             funds_controlled,
//             completion_script,
//           } -> {
//             let validity_check = valid_after(validity_range, deadline)

//             let token_burnt_check =
//               if funds_controlled > 0 {
//                 only_minted_token(
//                   mint,
//                   share_token,
//                   completion_script,
//                   -funds_controlled,
//                 )
//               } else {
//                 True
//               }

//             let proposer_key_signed_check =
//               key_signed(extra_signatories, proposer_key_hash)
//             validity_check? && token_burnt_check? && proposer_key_signed_check?
//           }
//           _ -> False
//         }
//     }
//   }

//   else(_) {
//     fail
//   }
// }
