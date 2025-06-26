// use aiken/collection/list
// use cardano/address.{Address, Inline, Script, from_script}
// use cardano/governance.{NoConfidence, ProposalProcedure}
// use cardano/transaction.{Transaction}
// use mocktail.{
//   mock_policy_id, mock_pub_key_hash, mock_script_hash,
//   mock_script_stake_key_hash,
// }
// use types.{CrowdfundDatum}

// pub const mock_auth_token = mock_policy_id(0)

// pub const mock_share_token = mock_policy_id(1)

// pub const mock_completion_script = mock_script_hash(0)

// pub const mock_crowdfund_spend_script_hash = mock_script_hash(1)

// pub const mock_crowdfund_stake_script_hash = mock_script_stake_key_hash(0)

// pub const mock_crowdfund_address = from_script(mock_crowdfund_spend_script_hash)

// pub const mock_fee_address = from_script("fee_address")

// pub const mock_fundraise_target = 100000000000

// pub const mock_current_fundraised_amount = mock_fundraise_target + 1000000

// pub const mock_contribute_min_fundraised_amount = 2000000

// pub const mock_deadline = 1750735607

// pub const mock_expiry_buffer = 3600 * 24

// pub const mock_min_charge = 0

// pub fn mock_crowdfund_datum(
//   current_fundraised_amount: Int,
//   allow_over_subscription: Bool,
// ) {
//   CrowdfundDatum {
//     completion_script: mock_completion_script,
//     share_token: mock_share_token,
//     crowdfund_address: mock_crowdfund_address,
//     fundraise_target: mock_fundraise_target,
//     current_fundraised_amount,
//     allow_over_subscription,
//     deadline: mock_deadline,
//     expiry_buffer: mock_expiry_buffer,
//     fee_address: mock_fee_address,
//     min_charge: mock_min_charge,
//   }
// }

// pub const mock_spend_script_hash = mock_script_hash(1)

// pub const mock_stake_script_hash = mock_script_hash(2)

// pub const mock_crowdfund_gov_address = from_script(mock_spend_script_hash)

// pub const mock_gov_address =
//   Address {
//     payment_credential: Script(mock_spend_script_hash),
//     stake_credential: Some(Inline(Script(mock_stake_script_hash))),
//   }

// pub const mock_gov_action_period = 3600

// pub const mock_delegate_pool_id = mock_script_hash(3)

// pub const mock_gov_action = NoConfidence { ancestor: None }

// pub const mock_proposer_key_hash = mock_pub_key_hash(0)

// pub const mock_stake_register_deposit = 2000000

// pub const mock_drep_register_deposit = 500000000

// pub const mock_funds_controlled =
//   mock_fundraise_target + mock_stake_register_deposit + mock_drep_register_deposit

// pub fn add_proposal_procedure(
//   tx: Transaction,
//   condition: Bool,
//   proposal_procedure: ProposalProcedure,
// ) -> Transaction {
//   if !condition {
//     tx
//   } else {
//     Transaction {
//       ..tx,
//       proposal_procedures: tx.proposal_procedures
//         |> list.concat([proposal_procedure]),
//     }
//   }
// }
