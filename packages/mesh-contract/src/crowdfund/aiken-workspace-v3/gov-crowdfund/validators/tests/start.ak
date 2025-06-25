use cardano/address.{Script}
use cardano/assets.{add, from_lovelace}
use cardano/transaction.{Transaction}
use mocktail.{
  complete, mock_script_hash, mock_tx_hash, mocktail_tx, tx_in,
  tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use start
use tests/utils.{
  mock_auth_token, mock_completion_script, mock_crowdfund_address,
  mock_crowdfund_datum, mock_current_fundraised_amount, mock_deadline,
  mock_fundraise_target, mock_gov_action_period, mock_gov_address,
  mock_share_token, mock_spend_script_hash, mock_stake_script_hash,
}
use types.{Init}

type StartTestCase {
  is_only_one_auth_inputed: Bool,
  is_fundraise_target_sent: Bool,
  is_fundraise_target_amount_correct: Bool,
  is_fundraise_output_datum_correct: Bool,
}

fn mock_stake_tx(test_case: StartTestCase) -> Transaction {
  let StartTestCase {
    is_only_one_auth_inputed,
    is_fundraise_target_sent,
    is_fundraise_target_amount_correct,
    is_fundraise_output_datum_correct,
  } = test_case
  let auth_input =
    from_lovelace(20000000) |> add(mock_auth_token, mock_completion_script, 1)

  let fundraise_output =
    if is_fundraise_target_amount_correct {
      from_lovelace(mock_fundraise_target)
    } else {
      from_lovelace(mock_fundraise_target - 1000000)
    }

  let fundraise_output_datum =
    if is_fundraise_output_datum_correct {
      Init {
        completion_script: mock_completion_script,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      }
    } else {
      Init {
        completion_script: mock_completion_script,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount + 1000000,
        deadline: mock_deadline + mock_gov_action_period,
      }
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, auth_input, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(mock_current_fundraised_amount, True),
      )
    |> tx_in(
        !is_only_one_auth_inputed,
        mock_tx_hash(0),
        1,
        auth_input,
        mock_crowdfund_address,
      )
    |> tx_out(is_fundraise_target_sent, mock_gov_address, fundraise_output)
    |> tx_out_inline_datum(is_fundraise_target_sent, fundraise_output_datum)
    |> complete()
}

test s3_withdraw_success() {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_completion_script),
    tx,
  )
}

test s3_withdraw_fail_with_more_than_one_auth_inputed() fail {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: False,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_completion_script),
    tx,
  )
}

test s3_withdraw_fail_with_fundraise_target_not_sent() fail {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: True,
        is_fundraise_target_sent: False,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_completion_script),
    tx,
  )
}

test s3_withdraw_fail_with_incorrect_fundraise_target_output_amount() {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: False,
        is_fundraise_output_datum_correct: True,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_completion_script),
    tx,
  )
}

test s3_withdraw_fail_with_incorrect_fundraise_target_output_datum() {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: False,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_completion_script),
    tx,
  )
}

test s3_withdraw_fail_with_different_completion_script() {
  let tx =
    mock_stake_tx(
      StartTestCase {
        is_only_one_auth_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: False,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_stake_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_script_hash(999)),
    tx,
  )
}
