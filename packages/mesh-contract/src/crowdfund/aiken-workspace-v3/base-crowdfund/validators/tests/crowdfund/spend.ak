use cardano/assets.{add, from_lovelace}
use cardano/transaction.{Transaction}
use crowdfund/spend as crowdfund_spend
use mocktail.{
  add_extra_signatory, complete, invalid_before, invalid_hereafter, mint,
  mock_policy_id, mock_pub_key_address, mock_tx_hash, mock_utxo_ref, mocktail_tx,
  script_withdrawal, tx_in, tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use tests/utils.{
  mock_auth_token, mock_completion_script, mock_contribute_min_fundraised_amount,
  mock_contribute_over_fundraised_amount, mock_crowdfund_address,
  mock_crowdfund_datum, mock_current_fundraised_amount, mock_deadline,
  mock_expiry_buffer, mock_extra_fundraised_amount, mock_fee_address,
  mock_fundraise_target, mock_min_charge, mock_proposer_key_hash,
  mock_share_token,
}
use types.{
  CompleteCrowdfund, ContributeFund, ContributorWithdrawal, RemoveEmptyInstance,
}

type ContributeFundTestCase {
  is_only_one_auth_inputed: Bool,
  is_only_one_auth_outputed: Bool,
  is_auth_output_datum_correct: Bool,
  is_auth_output_value_clean: Bool,
  is_deadline_not_passed: Bool,
  is_shares_minted: Bool,
}

fn mock_contribute_fund_tx(
  test_case: ContributeFundTestCase,
  current_fundraised_amount: Int,
  contribute_amount: Int,
  allow_over_subscription: Bool,
) -> Transaction {
  let ContributeFundTestCase {
    is_only_one_auth_inputed,
    is_only_one_auth_outputed,
    is_auth_output_datum_correct,
    is_auth_output_value_clean,
    is_deadline_not_passed,
    is_shares_minted,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount)
      |> add(mock_auth_token, mock_completion_script, 1)

  let output_value =
    from_lovelace(current_fundraised_amount + contribute_amount)
      |> add(mock_auth_token, mock_completion_script, 1)

  let auth_correct_output_datum =
    mock_crowdfund_datum(
      current_fundraised_amount + contribute_amount,
      allow_over_subscription,
    )

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(current_fundraised_amount, allow_over_subscription),
      )
    |> tx_in(
        !is_only_one_auth_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_crowdfund_address,
      )
    |> tx_in(
        True,
        mock_tx_hash(1),
        0,
        from_lovelace(contribute_amount),
        mock_pub_key_address(0, None),
      )
    |> tx_out(is_auth_output_value_clean, mock_crowdfund_address, output_value)
    |> tx_out(
        !is_auth_output_value_clean,
        mock_crowdfund_address,
        output_value |> add(mock_policy_id(999), mock_completion_script, 1),
      )
    |> tx_out_inline_datum(is_auth_output_datum_correct, auth_correct_output_datum)
    |> tx_out_inline_datum(
        !is_auth_output_datum_correct,
        mock_crowdfund_datum(
          current_fundraised_amount + contribute_amount + 9999999,
          allow_over_subscription,
        ),
      )
    |> tx_out(!is_only_one_auth_outputed, mock_crowdfund_address, output_value)
    |> invalid_hereafter(is_deadline_not_passed, mock_deadline - 3600 * 24)
    |> invalid_hereafter(!is_deadline_not_passed, mock_deadline + 3600 * 24)
    |> mint(
        is_shares_minted,
        contribute_amount,
        mock_share_token,
        mock_completion_script,
      )
    |> mint(
        !is_shares_minted,
        contribute_amount + 9999999,
        mock_share_token,
        mock_completion_script,
      )
    |> complete()
}

test s3_spend_success_contribute_fund_with_not_allow_over_subscription() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_contribute_fund_with_allow_over_subscription() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      True,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, True)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_contribute_fund_with_allow_over_subscription_and_over_fundraised() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_over_fundraised_amount,
      True,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, True)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_not_allow_over_subscription_but_over_fundraised() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_over_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_over_current_fundraised() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_more_than_one_auth_inputed() fail {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: False,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_more_than_one_auth_outputed() fail {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: False,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_incorrect_auth_output_datum() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: False,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_auth_output_not_clean() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: False,
        is_deadline_not_passed: True,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_deadline_passed() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: False,
        is_shares_minted: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contribute_fund_with_wrong_shares_minted() {
  let tx =
    mock_contribute_fund_tx(
      ContributeFundTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_deadline_not_passed: True,
        is_shares_minted: False,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    ContributeFund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type CompleteCrowdfundTestCase {
  is_only_one_auth_inputed: Bool,
  is_output_to_fee_address_correct: Bool,
  is_auth_burnt: Bool,
  is_completion_script_executed: Bool,
}

fn mock_complete_crowdfund_tx(
  test_case: CompleteCrowdfundTestCase,
  current_fundraised_amount: Int,
  allow_over_subscription: Bool,
) -> Transaction {
  let CompleteCrowdfundTestCase {
    is_only_one_auth_inputed,
    is_output_to_fee_address_correct,
    is_auth_burnt,
    is_completion_script_executed,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount + mock_min_charge)
      |> add(mock_auth_token, mock_completion_script, 1)

  let output_value = from_lovelace(mock_min_charge)

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(current_fundraised_amount, allow_over_subscription),
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
        from_lovelace(mock_extra_fundraised_amount - 10),
      )
    |> script_withdrawal(
        is_completion_script_executed,
        mock_completion_script,
        2_000_000,
      )
    |> mint(is_auth_burnt, -1, mock_auth_token, mock_completion_script)
    |> complete()
}

test s3_spend_success_complete_crowdfund_with_amount_equal_to_target() {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: True,
        is_completion_script_executed: True,
      },
      mock_fundraise_target,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_complete_crowdfund_with_amount_larger_than_target() {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: True,
        is_completion_script_executed: True,
      },
      mock_contribute_over_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_complete_crowdfund_with_amount_less_than_target() {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: True,
        is_completion_script_executed: True,
      },
      mock_fundraise_target - 1,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target - 1, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_complete_crowdfund_with_more_than_one_auth_inputed() fail {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: False,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: True,
        is_completion_script_executed: True,
      },
      mock_fundraise_target,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_complete_crowdfund_with_incorrect_fee_output() fail {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: False,
        is_auth_burnt: True,
        is_completion_script_executed: True,
      },
      mock_fundraise_target,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_complete_crowdfund_with_no_auth_burnt() {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: False,
        is_completion_script_executed: True,
      },
      mock_fundraise_target,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_complete_crowdfund_with_no_completion_script_executed() {
  let tx =
    mock_complete_crowdfund_tx(
      CompleteCrowdfundTestCase {
        is_only_one_auth_inputed: True,
        is_output_to_fee_address_correct: True,
        is_auth_burnt: True,
        is_completion_script_executed: False,
      },
      mock_fundraise_target,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_fundraise_target, False)),
    CompleteCrowdfund,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type ContributorWithdrawalTestCase {
  is_only_one_auth_inputed: Bool,
  is_only_one_auth_outputed: Bool,
  is_auth_output_datum_correct: Bool,
  is_auth_output_value_clean: Bool,
  is_auth_unlock_value_correct: Bool,
  is_deadline_passed: Bool,
  is_shares_burnt: Bool,
}

fn mock_contributor_withdrawal_tx(
  test_case: ContributorWithdrawalTestCase,
  current_fundraised_amount: Int,
  withdraw_amount: Int,
  allow_over_subscription: Bool,
) -> Transaction {
  let ContributorWithdrawalTestCase {
    is_only_one_auth_inputed,
    is_only_one_auth_outputed,
    is_auth_output_datum_correct,
    is_auth_output_value_clean,
    is_auth_unlock_value_correct,
    is_deadline_passed,
    is_shares_burnt,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount)
      |> add(mock_auth_token, mock_completion_script, 1)

  let output_value =
    if is_auth_unlock_value_correct {
      from_lovelace(current_fundraised_amount - withdraw_amount)
        |> add(mock_auth_token, mock_completion_script, 1)
    } else {
      from_lovelace(current_fundraised_amount - withdraw_amount + 10)
        |> add(mock_auth_token, mock_completion_script, 1)
    }

  let auth_correct_output_datum =
    mock_crowdfund_datum(
      current_fundraised_amount - withdraw_amount,
      allow_over_subscription,
    )

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(current_fundraised_amount, allow_over_subscription),
      )
    |> tx_in(
        !is_only_one_auth_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_crowdfund_address,
      )
    |> tx_out(True, mock_pub_key_address(0, None), from_lovelace(withdraw_amount))
    |> tx_out(is_auth_output_value_clean, mock_crowdfund_address, output_value)
    |> tx_out(
        !is_auth_output_value_clean,
        mock_crowdfund_address,
        output_value |> add(mock_policy_id(999), mock_completion_script, 1),
      )
    |> tx_out_inline_datum(is_auth_output_datum_correct, auth_correct_output_datum)
    |> tx_out_inline_datum(
        !is_auth_output_datum_correct,
        mock_crowdfund_datum(
          current_fundraised_amount - withdraw_amount + 9999999,
          allow_over_subscription,
        ),
      )
    |> tx_out(!is_only_one_auth_outputed, mock_crowdfund_address, output_value)
    |> invalid_before(
        is_deadline_passed,
        mock_deadline + mock_expiry_buffer + 3600 * 24,
      )
    |> invalid_before(
        !is_deadline_passed,
        mock_deadline + mock_expiry_buffer - 3600 * 24,
      )
    |> mint(
        is_shares_burnt,
        -withdraw_amount,
        mock_share_token,
        mock_completion_script,
      )
    |> mint(
        !is_shares_burnt,
        -withdraw_amount + 9999999,
        mock_share_token,
        mock_completion_script,
      )
    |> complete()
}

test s3_spend_success_contributor_withdraw_with_deadline_passed_but_fundraised_reach_target() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_contributor_withdraw_with_deadline_passed_and_fundraised_less_than_target() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount * 2,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount * 2, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_contributor_withdraw_with_deadline_not_passed_but_fundraised_less_than_target() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: False,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount * 2,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount * 2, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_deadline_not_passed_and_fundraised_reached_target() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: False,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_more_thanone_auth_inputed() fail {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: False,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_more_thanone_auth_outputed() fail {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: False,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_incorrect_output_datum() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: False,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_auth_output_value_not_clean() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: False,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_incorrect_auth_unlock_value() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: False,
        is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_contributor_withdraw_with_incorrect_shares_burnt() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_auth_inputed: True,
        is_only_one_auth_outputed: True,
        is_auth_output_datum_correct: True,
        is_auth_output_value_clean: True,
        is_auth_unlock_value_correct: True,
        is_deadline_passed: True,
        is_shares_burnt: False,
      },
      mock_contribute_over_fundraised_amount,
      mock_contribute_min_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_contribute_over_fundraised_amount, False)),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type RemoveEmptyInstanceTestCase {
  is_only_one_auth_inputed: Bool,
  is_deadline_passed: Bool,
  is_shares_burnt: Bool,
  is_auth_burnt: Bool,
  is_proposer_signed: Bool,
}

fn mock_remove_empty_instance_tx(
  test_case: RemoveEmptyInstanceTestCase,
  current_fundraised_amount: Int,
  allow_over_subscription: Bool,
) -> Transaction {
  let RemoveEmptyInstanceTestCase {
    is_only_one_auth_inputed,
    is_deadline_passed,
    is_shares_burnt,
    is_auth_burnt,
    is_proposer_signed,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount)
      |> add(mock_auth_token, mock_completion_script, 1)

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_crowdfund_address)
    |> tx_in_inline_datum(
        True,
        mock_crowdfund_datum(current_fundraised_amount, allow_over_subscription),
      )
    |> tx_in(
        !is_only_one_auth_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_crowdfund_address,
      )
    |> invalid_before(is_deadline_passed, mock_deadline + 3600 * 24)
    |> invalid_before(!is_deadline_passed, mock_deadline - 3600 * 24)
    |> mint(
        is_shares_burnt,
        -current_fundraised_amount,
        mock_share_token,
        mock_completion_script,
      )
    |> mint(
        !is_shares_burnt,
        -current_fundraised_amount + 9999999,
        mock_share_token,
        mock_completion_script,
      )
    |> mint(is_auth_burnt, -1, mock_auth_token, mock_completion_script)
    |> complete()
    |> add_extra_signatory(is_proposer_signed, mock_proposer_key_hash)
}

test s3_spend_success_remove_empty_instance_wih_zero_fund() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
        is_auth_burnt: True,
        is_proposer_signed: True,
      },
      0,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(0, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_success_remove_empty_instance_wih_some_fund() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
        is_auth_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_remove_empty_instance_wih_more_than_one_auth_inputed() fail {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: False,
        is_deadline_passed: True,
        is_shares_burnt: True,
        is_auth_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
      False,
    )

  crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_remove_empty_instance_wih_deadline_not_passed() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: True,
        is_deadline_passed: False,
        is_shares_burnt: True,
        is_auth_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_remove_empty_instance_wih_share_not_burnt() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: True,
        is_deadline_passed: True,
        is_shares_burnt: False,
        is_auth_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s3_spend_fail_remove_empty_instance_wih_authe_not_burnt() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_auth_inputed: True,
        is_deadline_passed: True,
        is_shares_burnt: True,
        is_auth_burnt: False,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
      False,
    )

  !crowdfund_spend.crowdfund.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}
