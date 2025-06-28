use cardano/address.{Script}
use cardano/assets.{add, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction}
use crowdfund.{
  CompleteCrowdfund, ContributeFund, CrowdfundRedeemer as ACrowdfundRedeemer,
}
use mocktail.{
  add_redeemer, complete, mint, mock_policy_id, mock_script_hash, mock_tx_hash,
  mock_utxo_ref, mocktail_tx, script_withdrawal, tx_in, tx_in_inline_datum,
  tx_out, tx_out_inline_datum,
}
use start
use tests/utils.{
  mock_auth_token, mock_completion_script, mock_crowdfund_address,
  mock_crowdfund_datum, mock_current_fundraised_amount, mock_deadline,
  mock_extra_fundraised_amount, mock_fee_address, mock_fundraise_target,
  mock_gov_action_period, mock_gov_address, mock_min_charge, mock_share_token,
  mock_spend_script_hash, mock_start_hash,
}
use types.{Init, RMint}

type CompleteCrowdfundTestCase {
  is_only_one_auth_inputed: Bool,
  is_output_to_fee_address_correct: Bool,
  is_auth_burnt: Bool,
  is_completion_script_executed: Bool,
  is_fundraise_target_sent: Bool,
  is_fundraise_target_amount_correct: Bool,
  is_fundraise_output_datum_correct: Bool,
  is_token_minted: Bool,
}

fn mock_complete_crowdfund_tx(
  test_case: CompleteCrowdfundTestCase,
  current_fundraised_amount: Int,
  auth_token_redeemer: ACrowdfundRedeemer,
) -> Transaction {
  let CompleteCrowdfundTestCase {
    is_only_one_auth_inputed,
    is_output_to_fee_address_correct,
    is_auth_burnt,
    is_completion_script_executed,
    is_fundraise_target_sent,
    is_fundraise_target_amount_correct,
    is_fundraise_output_datum_correct,
    is_token_minted,
  } = test_case
  let auth_token_redeemer_data: Data = auth_token_redeemer
  let fundraise_output =
    if is_fundraise_target_amount_correct {
      from_lovelace(mock_fundraise_target)
        |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(mock_fundraise_target - 1000000)
        |> add(mock_start_hash, "", 1)
    }
  let fundraise_output_datum =
    if is_fundraise_output_datum_correct {
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      }
    } else {
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: current_fundraised_amount + 1000000,
        deadline: mock_deadline + mock_gov_action_period,
      }
    }
  let input_value =
    from_lovelace(
      current_fundraised_amount + mock_min_charge + mock_extra_fundraised_amount,
    )
      |> add(mock_auth_token, mock_completion_script, 1)
      |> add(mock_policy_id(999), mock_completion_script, 10)

  let output_value =
    from_lovelace(mock_extra_fundraised_amount)
      |> add(mock_policy_id(999), mock_completion_script, 10)

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(current_fundraised_amount, False),
      )
    |> tx_in(
        !is_only_one_auth_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_crowdfund_address,
      )
    |> tx_out(is_output_to_fee_address_correct, mock_fee_address, output_value)
    |> tx_out(
        !is_output_to_fee_address_correct,
        mock_fee_address,
        from_lovelace(mock_extra_fundraised_amount - 10)
          |> add(mock_policy_id(999), mock_completion_script, 10),
      )
    |> tx_out(is_fundraise_target_sent, mock_gov_address, fundraise_output)
    |> tx_out_inline_datum(is_fundraise_target_sent, fundraise_output_datum)
    |> script_withdrawal(
        is_completion_script_executed,
        mock_completion_script,
        2_000_000,
      )
    |> mint(is_auth_burnt, -1, mock_auth_token, mock_completion_script)
    |> mint(is_token_minted, 1, mock_start_hash, "")
    |> complete()
    |> add_redeemer(
        True,
        Pair(
          Spend(
            OutputReference { transaction_id: mock_tx_hash(0), output_index: 0 },
          ),
          auth_token_redeemer_data,
        ),
      )
}

fn check_all_scripts(
  test_case: CompleteCrowdfundTestCase,
  current_fundraised_amount: Int,
  auth_token_redeemer: ACrowdfundRedeemer,
  start_hash: ByteArray,
) {
  let tx =
    mock_complete_crowdfund_tx(
      test_case,
      current_fundraised_amount,
      auth_token_redeemer,
    )

  let check_auth_spend =
    crowdfund.crowdfund.spend(
      mock_auth_token,
      Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
      auth_token_redeemer,
      mock_utxo_ref(0, 0),
      tx,
    )
  let check_token_mint =
    start.start.mint(
      mock_auth_token,
      mock_spend_script_hash,
      mock_gov_action_period,
      RMint,
      start_hash,
      tx,
    )

  let check_start_withdraw =
    start.start.withdraw(
      mock_auth_token,
      mock_spend_script_hash,
      mock_gov_action_period,
      None,
      Script(start_hash),
      tx,
    )
  check_auth_spend? && check_token_mint? && check_start_withdraw?
}

test complete_crowdfund_success_with_amount_equal_to_target() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_success_with_amount_larger_than_target() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_amount_less_than_target() fail {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount - 1000000,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_more_than_one_auth_inputed() fail {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: False,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_incorrect_fee_output() fail {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: False,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_no_auth_burnt() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: False,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_no_completion_script_executed() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: False,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_fundraise_target_not_sent() fail {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: False,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_incorrect_fundraise_target_output_amount() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: False,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_incorrect_fundraise_target_output_datum() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: False,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_token_not_minted() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: False,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_start_hash,
  )
}

test complete_crowdfund_fail_with_different_start_hash() {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_script_hash(999),
  )
}

test complete_crowdfund_fail_with_input_wrong_redeemer() fail {
  let test_case =
    CompleteCrowdfundTestCase {
      is_only_one_auth_inputed: True,
      is_output_to_fee_address_correct: True,
      is_auth_burnt: True,
      is_completion_script_executed: True,
      is_fundraise_target_sent: True,
      is_fundraise_target_amount_correct: True,
      is_fundraise_output_datum_correct: True,
      is_token_minted: True,
    }

  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    ContributeFund,
    mock_script_hash(999),
  )
}
