use cardano/assets.{add, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction}
use crowdfund/spend as crowdfund_spend
use mocktail.{
  add_redeemer, complete, invalid_hereafter, mint, mock_policy_id,
  mock_pub_key_address, mock_tx_hash, mock_utxo_ref, mocktail_tx, tx_in,
  tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use share_token/mint as share_token_mint
use tests/utils.{
  mock_auth_token, mock_completion_script, mock_contribute_min_fundraised_amount,
  mock_contribute_over_fundraised_amount, mock_crowdfund_address,
  mock_crowdfund_datum, mock_current_fundraised_amount, mock_deadline,
  mock_share_token,
}
use types.{CompleteCrowdfund, ContributeFund, CrowdfundRedeemer, RMint}

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
  auth_token_redeemer: CrowdfundRedeemer,
) -> Transaction {
  let ContributeFundTestCase {
    is_only_one_auth_inputed,
    is_only_one_auth_outputed,
    is_auth_output_datum_correct,
    is_auth_output_value_clean,
    is_deadline_not_passed,
    is_shares_minted,
  } = test_case
  let auth_token_redeemer_data: Data = auth_token_redeemer

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
  test_case: ContributeFundTestCase,
  current_fundraised_amount: Int,
  contribute_amount: Int,
  allow_over_subscription: Bool,
  auth_token_redeemer: CrowdfundRedeemer,
) {
  let tx =
    mock_contribute_fund_tx(
      test_case,
      current_fundraised_amount,
      contribute_amount,
      allow_over_subscription,
      auth_token_redeemer,
    )

  let check_auth_spend =
    crowdfund_spend.crowdfund.spend(
      mock_auth_token,
      Some(
        mock_crowdfund_datum(
          mock_current_fundraised_amount,
          allow_over_subscription,
        ),
      ),
      auth_token_redeemer,
      mock_utxo_ref(0, 0),
      tx,
    )
  let check_share_mint =
    share_token_mint.share_token.mint(
      mock_auth_token,
      RMint,
      mock_share_token,
      tx,
    )

  check_auth_spend? && check_share_mint?
}

test contribute_fund_success_with_not_allow_over_subscription() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_success_with_allow_over_subscription() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    True,
    ContributeFund,
  )
}

test contribute_fund_success_with_allow_over_subscription_and_over_fundraised() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_over_fundraised_amount,
    True,
    ContributeFund,
  )
}

test contribute_fund_fail_with_not_allow_over_subscription_but_over_fundraised() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_over_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_over_current_fundraised() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  !check_all_scripts(
    test_case,
    mock_contribute_over_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_wrong_redeemer() fail {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    CompleteCrowdfund,
  )
}

test contribute_fund_fail_with_more_than_one_auth_inputed() fail {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: False,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_more_than_one_auth_outputed() fail {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: False,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_incorrect_auth_output_datum() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: False,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_auth_output_not_clean() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: False,
      is_deadline_not_passed: True,
      is_shares_minted: True,
    }
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_deadline_passed() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: False,
      is_shares_minted: True,
    }
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}

test contribute_fund_fail_with_wrong_shares_minted() {
  let test_case =
    ContributeFundTestCase {
      is_only_one_auth_inputed: True,
      is_only_one_auth_outputed: True,
      is_auth_output_datum_correct: True,
      is_auth_output_value_clean: True,
      is_deadline_not_passed: True,
      is_shares_minted: False,
    }
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    mock_contribute_min_fundraised_amount,
    False,
    ContributeFund,
  )
}
