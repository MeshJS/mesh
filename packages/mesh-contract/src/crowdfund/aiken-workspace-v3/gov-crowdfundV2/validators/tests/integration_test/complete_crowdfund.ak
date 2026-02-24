use cardano/assets.{add, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction}
use gcf_spend as gcf_spend_validator
use mocktail.{
  add_redeemer, complete, mint, mock_policy_id, mock_tx_hash,
  mock_utxo_ref, mocktail_tx, script_withdrawal, tx_in, tx_in_inline_datum,
  tx_out, tx_out_inline_datum,
}
use share_token/mint as share_token_mint
use tests/test_utils.{
  mock_auth_token, mock_completion_script, mock_crowdfund_address,
  mock_crowdfund_datum, mock_current_fundraised_amount,
  mock_delegate_pool_id, mock_drep_register_deposit, mock_fee_address,
  mock_fundraise_target, mock_gov_action, mock_gov_deposit,
  mock_gov_address, mock_min_charge, mock_proposer_key_hash, mock_share_token,
  mock_stake_hash, mock_stake_register_deposit,
}
use types.{CompleteCrowdfund, CrowdfundGovRedeemer, RegisterCerts, RMint}

// Note: CompleteCrowdfund is not implemented in V2 (returns False)
// This test file is kept for reference but tests will fail as expected
// The actual completion flow uses RegisterCerts instead

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
  auth_token_redeemer: CrowdfundGovRedeemer,
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
        |> add(mock_stake_hash, "", 1)
    } else {
      from_lovelace(mock_fundraise_target - 1000000)
        |> add(mock_stake_hash, "", 1)
    }
  let fundraise_output_datum =
    if is_fundraise_output_datum_correct {
      mock_crowdfund_datum(current_fundraised_amount, False)
    } else {
      mock_crowdfund_datum(current_fundraised_amount + 1000000, False)
    }
  let input_value =
    from_lovelace(current_fundraised_amount + mock_min_charge)
      |> add(mock_auth_token, "", 1)

  let output_value = from_lovelace(mock_min_charge)

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
        from_lovelace(mock_current_fundraised_amount - 10)
          |> add(mock_policy_id(999), mock_completion_script, 10),
      )
    |> tx_out(is_fundraise_target_sent, mock_gov_address, fundraise_output)
    |> tx_out_inline_datum(is_fundraise_target_sent, fundraise_output_datum)
    |> script_withdrawal(
        is_completion_script_executed,
        mock_completion_script,
        2_000_000,
      )
    |> mint(is_auth_burnt, -1, mock_auth_token, "")
    |> mint(is_token_minted, 1, mock_stake_hash, "")
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
  auth_token_redeemer: CrowdfundGovRedeemer,
  _stake_hash: ByteArray,
) {
  let tx =
    mock_complete_crowdfund_tx(
      test_case,
      current_fundraised_amount,
      auth_token_redeemer,
    )

  let check_auth_spend =
    gcf_spend_validator.gCf_spend.spend(
      mock_auth_token,
      mock_proposer_key_hash,
      mock_gov_action,
      mock_delegate_pool_id,
      mock_stake_register_deposit,
      mock_drep_register_deposit,
      mock_gov_deposit,
      Some(mock_crowdfund_datum(mock_current_fundraised_amount, False)),
      auth_token_redeemer,
      mock_utxo_ref(0, 0),
      tx,
    )
  let check_token_mint =
    share_token_mint.share_token.mint(
      mock_auth_token,
      RMint,
      mock_share_token,
      tx,
    )

  // Note: V2 doesn't have withdraw/mint for stake validator like V1
  // The stake validator only handles publish/propose/vote
  check_auth_spend? && check_token_mint?
}

// These tests will fail as CompleteCrowdfund returns False in V2
// They are kept for reference/documentation purposes

test complete_crowdfund_fail_not_implemented() {
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

  // CompleteCrowdfund is not implemented in V2
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    CompleteCrowdfund,
    mock_stake_hash,
  )
}

test complete_crowdfund_fail_with_input_wrong_redeemer() {
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

  // Using RegisterCerts instead - this should also fail for CompleteCrowdfund flow
  !check_all_scripts(
    test_case,
    mock_current_fundraised_amount,
    RegisterCerts,
    mock_stake_hash,
  )
}

