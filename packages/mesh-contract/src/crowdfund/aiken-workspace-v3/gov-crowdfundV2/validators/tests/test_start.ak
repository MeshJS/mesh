use cardano/assets.{add, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction}
use gcf_stake as gcf_stake_validator
use mocktail.{
  add_redeemer, complete, mock_tx_hash, mocktail_tx,
  tx_in,
}
use tests/test_utils.{
  mock_auth_token, mock_crowdfund_gov_address,
  mock_fundraise_target, mock_gov_action_period,
  mock_spend_script_hash, mock_stake_hash,
}
use types.{
  Deregister, DeregisterCerts, Register, RegisterCerts,
  VoteOnGovAction,
}

type StartTestCase {
  is_only_one_spend_inputed: Bool,
}

fn mock_start_tx(
  test_case: StartTestCase,
  only_input_redeemer: Data,
) -> Transaction {
  let StartTestCase { is_only_one_spend_inputed } = test_case
  let only_input =
    from_lovelace(mock_fundraise_target)
      |> add(mock_stake_hash, "", 1)
      |> add(mock_auth_token, "", 1)
  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, only_input, mock_crowdfund_gov_address)
    |> tx_in(
        !is_only_one_spend_inputed,
        mock_tx_hash(0),
        1,
        only_input,
        mock_crowdfund_gov_address,
      )
    |> complete()
    |> add_redeemer(
        True,
        Pair(
          Spend(
            OutputReference { transaction_id: mock_tx_hash(0), output_index: 0 },
          ),
          only_input_redeemer,
        ),
      )
}

test s2_success_publish_with_reg() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.publish(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    Register,
    None,
    tx,
  )
}

test s2_success_publish_with_dereg() {
  let only_input_redeemer: Data = DeregisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.publish(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    Deregister,
    None,
    tx,
  )
}

test s2_fail_publish_with_reg_but_deregister_cert() {
  let only_input_redeemer: Data = DeregisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  !gcf_stake_validator.gCf_stake.publish(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    Register,
    None,
    tx,
  )
}

test s2_fail_publish_with_dereg_but_register_cert() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  !gcf_stake_validator.gCf_stake.publish(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    Deregister,
    None,
    tx,
  )
}

test s2_fail_publish_with_more_than_one_input_from_hash() fail {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: False },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.publish(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    Register,
    None,
    tx,
  )
}

test s2_success_propose() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.propose(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

test s2_fail_propose_with_wrong_redeemer() {
  let only_input_redeemer: Data = VoteOnGovAction

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  !gcf_stake_validator.gCf_stake.propose(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

test s2_fail_propose_with_more_than_one_inputed() fail {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: False },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.propose(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

test s2_success_vote() {
  let only_input_redeemer: Data = VoteOnGovAction

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.vote(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

test s2_fail_vote_with_wrong_redeemer() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  !gcf_stake_validator.gCf_stake.vote(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

test s2_fail_vote_with_more_than_one_inputed() fail {
  let only_input_redeemer: Data = VoteOnGovAction

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: False },
      only_input_redeemer,
    )
  gcf_stake_validator.gCf_stake.vote(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}

