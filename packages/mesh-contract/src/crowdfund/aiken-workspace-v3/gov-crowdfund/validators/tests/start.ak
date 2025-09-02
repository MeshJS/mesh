use cardano/address.{Script}
use cardano/assets.{add, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction}
use crowdfund.{CompleteCrowdfund}
use mocktail.{
  add_redeemer, complete, mint, mock_script_hash, mock_tx_hash, mocktail_tx,
  script_withdrawal, tx_in, tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use start
use tests/utils.{
  mock_auth_token, mock_crowdfund_address, mock_crowdfund_datum,
  mock_crowdfund_gov_address, mock_current_fundraised_amount, mock_deadline,
  mock_fundraise_target, mock_gov_action_period, mock_gov_address,
  mock_share_token, mock_spend_script_hash, mock_start_hash,
}
use types.{
  Deregister, DeregisterCerts, Init, RBurn, RMint, Register, RegisterCerts,
  RemoveEmptyInstance, VoteOnGovAction,
}

type WithdrawTestCase {
  is_only_one_spend_inputed: Bool,
  is_fundraise_target_sent: Bool,
  is_fundraise_target_amount_correct: Bool,
  is_fundraise_output_datum_correct: Bool,
  is_token_minted: Bool,
  is_redeemer_correct: Bool,
}

fn mock_withdraw_tx(test_case: WithdrawTestCase) -> Transaction {
  let WithdrawTestCase {
    is_only_one_spend_inputed,
    is_fundraise_target_sent,
    is_fundraise_target_amount_correct,
    is_fundraise_output_datum_correct,
    is_token_minted,
    is_redeemer_correct,
  } = test_case

  let auth_input_redeemer: Data = CompleteCrowdfund
  let auth_input =
    from_lovelace(20000000) |> add(mock_auth_token, mock_start_hash, 1)

  let fundraise_output =
    if is_fundraise_target_amount_correct {
      from_lovelace(mock_fundraise_target) |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(mock_fundraise_target - 1000000)
        |> add(mock_start_hash, "", 1)
    }

  let fundraise_output_datum =
    if is_fundraise_output_datum_correct {
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      }
    } else {
      Init {
        start_hash: mock_start_hash,
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
        !is_only_one_spend_inputed,
        mock_tx_hash(0),
        1,
        auth_input,
        mock_crowdfund_address,
      )
    |> tx_out(is_fundraise_target_sent, mock_gov_address, fundraise_output)
    |> tx_out_inline_datum(is_fundraise_target_sent, fundraise_output_datum)
    |> mint(is_token_minted, 1, mock_start_hash, "")
    |> complete()
    |> add_redeemer(
        is_redeemer_correct,
        Pair(
          Spend(
            OutputReference { transaction_id: mock_tx_hash(0), output_index: 0 },
          ),
          auth_input_redeemer,
        ),
      )
}

test s2_withdraw_success() {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_more_than_one_auth_inputed() fail {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: False,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_fundraise_target_not_sent() fail {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: False,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_incorrect_fundraise_target_output_amount() {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: False,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_incorrect_fundraise_target_output_datum() {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: False,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_token_not_minted() {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: False,
        is_redeemer_correct: True,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_redeemer_wrong() fail {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: False,
      },
    )

  start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_start_hash),
    tx,
  )
}

test s2_withdraw_fail_with_different_start_hash() {
  let tx =
    mock_withdraw_tx(
      WithdrawTestCase {
        is_only_one_spend_inputed: True,
        is_fundraise_target_sent: True,
        is_fundraise_target_amount_correct: True,
        is_fundraise_output_datum_correct: True,
        is_token_minted: True,
        is_redeemer_correct: True,
      },
    )

  !start.start.withdraw(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    Script(mock_script_hash(999)),
    tx,
  )
}

test s2_success_mint() {
  let tx =
    mocktail_tx()
      |> script_withdrawal(True, mock_start_hash, 2_000_000)
      |> complete()

  start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RMint,
    mock_start_hash,
    tx,
  )
}

test s2_fail_mint_with_no_withdraw() {
  let tx =
    mocktail_tx()
      |> script_withdrawal(False, mock_start_hash, 2_000_000)
      |> complete()

  !start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RMint,
    mock_start_hash,
    tx,
  )
}

test s2_fail_mint_with_other_withdraw() {
  let tx =
    mocktail_tx()
      |> script_withdrawal(True, mock_script_hash(999), 2_000_000)
      |> complete()

  !start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RMint,
    mock_start_hash,
    tx,
  )
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
    from_lovelace(mock_fundraise_target) |> add(mock_start_hash, "", 1)
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

test s2_success_burn() {
  let only_input_redeemer: Data = RemoveEmptyInstance

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RBurn,
    mock_start_hash,
    tx,
  )
}

test s2_fail_burn_with_wrong_redeemer() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  !start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RBurn,
    mock_start_hash,
    tx,
  )
}

test s2_fail_burn_with_more_than_one_inputed() fail {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: False },
      only_input_redeemer,
    )
  start.start.mint(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    RBurn,
    mock_start_hash,
    tx,
  )
}

test s2_success_publish_with_reg() {
  let only_input_redeemer: Data = RegisterCerts

  let tx =
    mock_start_tx(
      StartTestCase { is_only_one_spend_inputed: True },
      only_input_redeemer,
    )
  start.start.publish(
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
  start.start.publish(
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
  !start.start.publish(
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
  !start.start.publish(
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
  start.start.publish(
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
  start.start.propose(
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
  !start.start.propose(
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
  start.start.propose(
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
  start.start.vote(
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
  !start.start.vote(
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
  start.start.vote(
    mock_auth_token,
    mock_spend_script_hash,
    mock_gov_action_period,
    None,
    None,
    tx,
  )
}
