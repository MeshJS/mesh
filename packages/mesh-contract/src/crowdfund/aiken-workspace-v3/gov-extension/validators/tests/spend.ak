use cardano/address.{Script}
use cardano/assets.{add, from_lovelace}
use cardano/certificate.{
  DelegateBlockProduction, DelegateCredential, DelegateVote, RegisterCredential,
  RegisterDelegateRepresentative, Registered, UnregisterCredential,
  UnregisterDelegateRepresentative,
}
use cardano/governance.{
  DelegateRepresentative, GovernanceActionId, NoConfidence, ProposalProcedure,
  Yes,
}
use cardano/transaction.{Transaction}
use mocktail.{
  add_certificate, add_extra_signatory, complete, invalid_before, mint,
  mock_policy_id, mock_pub_key_address, mock_tx_hash, mock_utxo_ref, mocktail_tx,
  tx_in, tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use spend
use tests/utils.{
  add_proposal_procedure, add_vote, mock_contribute_min_fundraised_amount,
  mock_current_fundraised_amount, mock_deadline, mock_delegate_pool_id,
  mock_drep_register_deposit, mock_fundraise_target, mock_funds_controlled,
  mock_gov_action, mock_gov_action_id, mock_gov_action_period, mock_gov_address,
  mock_proposer_key_hash, mock_share_token, mock_stake_register_deposit,
  mock_start_hash,
}
use types.{
  ContributorWithdrawal, DeregisterCerts, Init, Proposed, Refundable,
  RegisterCerts, RemoveEmptyInstance, VoteOnGovAction, Voted,
}

type RegisterCertsTestCase {
  is_only_one_inputed: Bool,
  is_only_one_outputed: Bool,
  is_output_datum_correct: Bool,
  is_output_value_clean: Bool,
  is_output_value_correct: Bool,
  is_stake_cert_register: Bool,
  is_drep_cert_register: Bool,
  is_drep_deposit_correct: Bool,
  is_stake_delegated: Bool,
  is_vote_delegated: Bool,
  is_gov_proposed: Bool,
}

fn mock_register_cert_tx(test_case: RegisterCertsTestCase) -> Transaction {
  let RegisterCertsTestCase {
    is_only_one_inputed,
    is_only_one_outputed,
    is_output_datum_correct,
    is_output_value_clean,
    is_output_value_correct,
    is_stake_cert_register,
    is_drep_cert_register,
    is_drep_deposit_correct,
    is_stake_delegated,
    is_vote_delegated,
    is_gov_proposed,
  } = test_case

  let input_value =
    from_lovelace(mock_funds_controlled) |> add(mock_start_hash, "", 1)

  let input_datum =
    Init {
      start_hash: mock_start_hash,
      share_token: mock_share_token,
      funds_controlled: mock_funds_controlled,
      deadline: mock_deadline + mock_gov_action_period,
    }
  let output_value =
    if is_output_value_correct {
      from_lovelace(
        mock_funds_controlled - mock_stake_register_deposit - mock_drep_register_deposit - mock_fundraise_target,
      )
        |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(
        mock_funds_controlled - mock_stake_register_deposit - mock_drep_register_deposit + 10 - mock_fundraise_target,
      )
        |> add(mock_start_hash, "", 1)
    }

  let output_datum =
    if is_output_datum_correct {
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      }
    } else {
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled + 10,
        deadline: mock_deadline + mock_gov_action_period,
      }
    }

  let drep_deposit =
    if is_drep_deposit_correct {
      mock_drep_register_deposit
    } else {
      mock_drep_register_deposit - 1000000
    }
  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_gov_address)
    |> tx_in_inline_datum(True, input_datum)
    |> tx_in(
        !is_only_one_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_gov_address,
      )
    |> tx_out(is_output_value_clean, mock_gov_address, output_value)
    |> tx_out(
        !is_output_value_clean,
        mock_gov_address,
        output_value |> add(mock_policy_id(999), mock_start_hash, 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> tx_out(!is_only_one_outputed, mock_gov_address, output_value)
    |> complete()
    |> add_certificate(
        is_stake_cert_register,
        RegisterCredential {
          credential: Script(mock_start_hash),
          deposit: Never,
        },
      )
    |> add_certificate(
        is_drep_cert_register,
        RegisterDelegateRepresentative {
          delegate_representative: Script(mock_start_hash),
          deposit: drep_deposit,
        },
      )
    |> add_certificate(
        is_stake_delegated,
        DelegateCredential {
          credential: Script(mock_start_hash),
          delegate: DelegateBlockProduction {
            stake_pool: mock_delegate_pool_id,
          },
        },
      )
    |> add_certificate(
        is_vote_delegated,
        DelegateCredential {
          credential: Script(mock_start_hash),
          delegate: DelegateVote {
            delegate_representative: Registered(Script(mock_start_hash)),
          },
        },
      )
    |> add_proposal_procedure(
        is_gov_proposed,
        ProposalProcedure {
          deposit: mock_fundraise_target,
          return_address: Script(mock_start_hash),
          governance_action: NoConfidence { ancestor: None },
        },
      )
}

test s1_spend_success_reg_cert() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_not_init_state() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_more_than_one_input() fail {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: False,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_more_than_one_output() fail {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: False,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_incorrect_output_datum() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: False,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_output_value_not_clean() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: False,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_incorrect_output_value() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: False,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_stake_cert_not_reg() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: False,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_drep_cert_not_reg() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: False,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_drep_deposit_incorrect() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: False,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_stake_not_delegated() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: False,
        is_vote_delegated: True,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_vote_not_delegated() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: False,
        is_gov_proposed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_gov_not_proposed() {
  let tx =
    mock_register_cert_tx(
      RegisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_register: True,
        is_drep_cert_register: True,
        is_drep_deposit_correct: True,
        is_stake_delegated: True,
        is_vote_delegated: True,
        is_gov_proposed: False,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type VoteOnGovActionTestCase {
  is_only_one_inputed: Bool,
  is_only_one_outputed: Bool,
  is_output_datum_correct: Bool,
  is_output_value_clean: Bool,
  is_output_value_same: Bool,
  is_voted_by_drep: Bool,
}

fn mock_vote_on_gov_action_tx(test_case: VoteOnGovActionTestCase) -> Transaction {
  let VoteOnGovActionTestCase {
    is_only_one_inputed,
    is_only_one_outputed,
    is_output_datum_correct,
    is_output_value_clean,
    is_output_value_same,
    is_voted_by_drep,
  } = test_case

  let input_value =
    from_lovelace(mock_current_fundraised_amount) |> add(mock_start_hash, "", 1)

  let input_datum =
    Proposed {
      start_hash: mock_start_hash,
      share_token: mock_share_token,
      funds_controlled: mock_current_fundraised_amount,
      deadline: mock_deadline + mock_gov_action_period,
    }
  let output_value =
    if is_output_value_same {
      from_lovelace(mock_current_fundraised_amount)
        |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(mock_current_fundraised_amount + 10)
        |> add(mock_start_hash, "", 1)
    }

  let output_datum =
    if is_output_datum_correct {
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
        gov_tx_id: mock_gov_action_id,
      }
    } else {
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
        gov_tx_id: GovernanceActionId {
          transaction: mock_tx_hash(0),
          proposal_procedure: 1,
        },
      }
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_gov_address)
    |> tx_in_inline_datum(True, input_datum)
    |> tx_in(
        !is_only_one_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_gov_address,
      )
    |> tx_out(
        True,
        mock_pub_key_address(0, None),
        from_lovelace(mock_fundraise_target),
      )
    |> tx_out(is_output_value_clean, mock_gov_address, output_value)
    |> tx_out(
        !is_output_value_clean,
        mock_gov_address,
        output_value |> add(mock_policy_id(999), mock_start_hash, 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> tx_out(!is_only_one_outputed, mock_gov_address, output_value)
    |> complete()
    |> add_vote(
        is_voted_by_drep,
        Pair(
          DelegateRepresentative(Script(mock_start_hash)),
          [Pair(mock_gov_action_id, Yes)],
        ),
      )
}

test s1_spend_success_vote_on_gov_action() {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_same: True,
        is_voted_by_drep: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_more_than_one_inputed() fail {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: False,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_same: True,
        is_voted_by_drep: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_more_than_one_outputed() fail {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: False,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_same: True,
        is_voted_by_drep: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_output_datum_wrong() {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: False,
        is_output_value_clean: True,
        is_output_value_same: True,
        is_voted_by_drep: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_output_value_not_clean() {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: False,
        is_output_value_same: True,
        is_voted_by_drep: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_incorrect_output_value() {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_same: False,
        is_voted_by_drep: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_vote_on_gov_action_with_no_vote() fail {
  let tx =
    mock_vote_on_gov_action_tx(
      VoteOnGovActionTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_same: True,
        is_voted_by_drep: False,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    VoteOnGovAction,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type DeregisterCertsTestCase {
  is_only_one_inputed: Bool,
  is_only_one_outputed: Bool,
  is_output_datum_correct: Bool,
  is_output_value_clean: Bool,
  is_output_value_correct: Bool,
  is_stake_cert_deregister: Bool,
  is_drep_cert_deregister: Bool,
  is_deadline_passed: Bool,
}

fn mock_deregister_cert_tx(test_case: DeregisterCertsTestCase) -> Transaction {
  let DeregisterCertsTestCase {
    is_only_one_inputed,
    is_only_one_outputed,
    is_output_datum_correct,
    is_output_value_clean,
    is_output_value_correct,
    is_stake_cert_deregister,
    is_drep_cert_deregister,
    is_deadline_passed,
  } = test_case

  let input_value =
    from_lovelace(mock_funds_controlled) |> add(mock_start_hash, "", 1)

  let input_datum =
    Voted {
      start_hash: mock_start_hash,
      share_token: mock_share_token,
      funds_controlled: mock_funds_controlled,
      gov_tx_id: mock_gov_action_id,
      deadline: mock_deadline + mock_gov_action_period,
    }
  let output_value =
    if is_output_value_correct {
      from_lovelace(
        mock_funds_controlled + mock_stake_register_deposit + mock_drep_register_deposit + mock_fundraise_target,
      )
        |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(
        mock_funds_controlled + mock_stake_register_deposit + mock_drep_register_deposit + mock_fundraise_target - 10,
      )
        |> add(mock_start_hash, "", 1)
    }

  let output_datum =
    if is_output_datum_correct {
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
      }
    } else {
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled + 10,
      }
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_gov_address)
    |> tx_in_inline_datum(True, input_datum)
    |> tx_in(
        !is_only_one_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_gov_address,
      )
    |> tx_out(is_output_value_clean, mock_gov_address, output_value)
    |> tx_out(
        !is_output_value_clean,
        mock_gov_address,
        output_value |> add(mock_policy_id(999), mock_start_hash, 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> tx_out(!is_only_one_outputed, mock_gov_address, output_value)
    |> invalid_before(
        is_deadline_passed,
        mock_deadline + mock_gov_action_period + 3600 * 24,
      )
    |> invalid_before(
        !is_deadline_passed,
        mock_deadline + mock_gov_action_period - 3600 * 24,
      )
    |> complete()
    |> add_certificate(
        is_stake_cert_deregister,
        UnregisterCredential {
          credential: Script(mock_start_hash),
          refund: Never,
        },
      )
    |> add_certificate(
        is_drep_cert_deregister,
        UnregisterDelegateRepresentative {
          delegate_representative: Script(mock_start_hash),
          refund: mock_drep_register_deposit,
        },
      )
}

test s1_spend_success_unregister_certs() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_more_than_one_inputed() fail {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: False,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_more_than_one_outputed() fail {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: False,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_output_datum_incorrect() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: False,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_output_value_not_clean() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: False,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_output_value_incorrect() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: False,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_stake_not_unregister() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: False,
        is_drep_cert_deregister: True,
        is_deadline_passed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_drep_not_unregister() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: False,
        is_deadline_passed: True,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_unregister_certs_with_deadline_not_passed() {
  let tx =
    mock_deregister_cert_tx(
      DeregisterCertsTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_output_value_correct: True,
        is_stake_cert_deregister: True,
        is_drep_cert_deregister: True,
        is_deadline_passed: False,
      },
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Voted {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        gov_tx_id: mock_gov_action_id,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    DeregisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type ContributorWithdrawalTestCase {
  is_only_one_inputed: Bool,
  is_only_one_outputed: Bool,
  is_output_datum_correct: Bool,
  is_output_value_clean: Bool,
  is_unlock_value_correct: Bool,
  //   is_deadline_passed: Bool,
  is_shares_burnt: Bool,
}

fn mock_contributor_withdrawal_tx(
  test_case: ContributorWithdrawalTestCase,
  current_fundraised_amount: Int,
  withdraw_amount: Int,
) -> Transaction {
  let ContributorWithdrawalTestCase {
    is_only_one_inputed,
    is_only_one_outputed,
    is_output_datum_correct,
    is_output_value_clean,
    is_unlock_value_correct,
    is_shares_burnt,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount) |> add(mock_start_hash, "", 1)

  let input_datum =
    Refundable {
      start_hash: mock_start_hash,
      share_token: mock_share_token,
      funds_controlled: current_fundraised_amount,
    }
  let output_value =
    if is_unlock_value_correct {
      from_lovelace(current_fundraised_amount - withdraw_amount)
        |> add(mock_start_hash, "", 1)
    } else {
      from_lovelace(current_fundraised_amount - withdraw_amount + 10)
        |> add(mock_start_hash, "", 1)
    }

  let output_datum =
    if is_output_datum_correct {
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: current_fundraised_amount - withdraw_amount,
      }
    } else {
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: current_fundraised_amount - withdraw_amount + 10,
      }
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_gov_address)
    |> tx_in_inline_datum(True, input_datum)
    |> tx_in(
        !is_only_one_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_gov_address,
      )
    |> tx_out(True, mock_pub_key_address(0, None), from_lovelace(withdraw_amount))
    |> tx_out(is_output_value_clean, mock_gov_address, output_value)
    |> tx_out(
        !is_output_value_clean,
        mock_gov_address,
        output_value |> add(mock_policy_id(999), mock_start_hash, 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> tx_out(!is_only_one_outputed, mock_gov_address, output_value) // |> invalid_before(
    //     is_deadline_passed,
    //     mock_deadline + mock_gov_action_period + 3600 * 24,
    //   )
    // |> invalid_before(
    //     !is_deadline_passed,
    //     mock_deadline + mock_gov_action_period - 3600 * 24,
    //   )
    
  |> mint(is_shares_burnt, -withdraw_amount, mock_share_token, mock_start_hash)
    |> mint(
        !is_shares_burnt,
        -withdraw_amount + 9999999,
        mock_share_token,
        mock_start_hash,
      )
    |> complete()
}

test s1_spend_success_contributor_withdraw() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_state_not_refundable() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Proposed {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_more_than_one_auth_inputed() fail {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: False,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_more_than_one_auth_outputed() fail {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: False,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_incorrect_output_datum() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: False,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_auth_output_value_not_clean() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: False,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_contributor_withdraw_with_incorrect_auth_unlock_value() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: False,
        // is_deadline_passed: True,
        is_shares_burnt: True,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

// test s1_spend_fail_contributor_withdraw_with_deadline_not_passed() {
//   let tx =
//     mock_contributor_withdrawal_tx(
//       ContributorWithdrawalTestCase {
//         is_only_one_inputed: True,
//         is_only_one_outputed: True,
//         is_output_datum_correct: True,
//         is_output_value_clean: True,
//         is_unlock_value_correct: True,
//         is_deadline_passed: False,
//         is_shares_burnt: True,
//       },
//       mock_current_fundraised_amount,
//       mock_contribute_min_fundraised_amount,
//     )

//   !spend.spend.spend(
//     mock_delegate_pool_id,
//     mock_gov_action,
//     mock_proposer_key_hash,
//     mock_stake_register_deposit,
//     mock_drep_register_deposit,
//     Some(
//       Refundable {
//         start_hash: mock_start_hash,
//         share_token: mock_share_token,
//         funds_controlled: mock_current_fundraised_amount,
//       },
//     ),
//     ContributorWithdrawal,
//     mock_utxo_ref(0, 0),
//     tx,
//   )
// }

test s1_spend_fail_contributor_withdraw_with_incorrect_shares_burnt() {
  let tx =
    mock_contributor_withdrawal_tx(
      ContributorWithdrawalTestCase {
        is_only_one_inputed: True,
        is_only_one_outputed: True,
        is_output_datum_correct: True,
        is_output_value_clean: True,
        is_unlock_value_correct: True,
        // is_deadline_passed: True,
        is_shares_burnt: False,
      },
      mock_current_fundraised_amount,
      mock_contribute_min_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    ContributorWithdrawal,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type RemoveEmptyInstanceTestCase {
  is_only_one_inputed: Bool,
  //   is_deadline_passed: Bool,
  is_shares_burnt: Bool,
  is_token_burnt: Bool,
  is_proposer_signed: Bool,
}

fn mock_remove_empty_instance_tx(
  test_case: RemoveEmptyInstanceTestCase,
  current_fundraised_amount: Int,
) -> Transaction {
  let RemoveEmptyInstanceTestCase {
    is_only_one_inputed,
    is_shares_burnt,
    is_token_burnt,
    is_proposer_signed,
  } = test_case

  let input_value =
    from_lovelace(current_fundraised_amount) |> add(mock_start_hash, "", 1)

  let input_datum =
    Refundable {
      start_hash: mock_start_hash,
      share_token: mock_share_token,
      funds_controlled: current_fundraised_amount,
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_gov_address)
    |> tx_in_inline_datum(True, input_datum)
    |> tx_in(
        !is_only_one_inputed,
        mock_tx_hash(0),
        1,
        input_value,
        mock_gov_address,
      )
    |> tx_out(
        True,
        mock_pub_key_address(0, None),
        from_lovelace(current_fundraised_amount),
      ) // |> invalid_before(
    //     is_deadline_passed,
    //     mock_deadline + mock_gov_action_period + 3600 * 24,
    //   )
    // |> invalid_before(
    //     !is_deadline_passed,
    //     mock_deadline + mock_gov_action_period - 3600 * 24,
    //   )
    
  |> mint(
        is_shares_burnt,
        -current_fundraised_amount,
        mock_share_token,
        mock_start_hash,
      )
    |> mint(
        !is_shares_burnt,
        -current_fundraised_amount + 9999999,
        mock_share_token,
        mock_start_hash,
      )
    |> mint(is_token_burnt, -1, mock_start_hash, "")
    |> complete()
    |> add_extra_signatory(is_proposer_signed, mock_proposer_key_hash)
}

test s1_spend_success_remove_empty_instance_wih_zero_fund() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: True,
        is_proposer_signed: True,
      },
      0,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: 0,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_success_remove_empty_instance_wih_some_fund() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_remove_empty_instance_wih_state_not_refundable() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Init {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
        deadline: mock_deadline + mock_gov_action_period,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_remove_empty_instance_wih_more_than_one_auth_inputed() fail {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: False,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
    )

  spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

// test s1_spend_fail_remove_empty_instance_wih_deadline_not_passed() {
//   let tx =
//     mock_remove_empty_instance_tx(
//       RemoveEmptyInstanceTestCase {
//         is_only_one_inputed: True,
//         is_deadline_passed: False,
//         is_shares_burnt: True,
//         is_token_burnt: True,
//         is_proposer_signed: True,
//       },
//       mock_current_fundraised_amount,
//     )

//   !spend.spend.spend(
//     mock_delegate_pool_id,
//     mock_gov_action,
//     mock_proposer_key_hash,
//     mock_stake_register_deposit,
//     mock_drep_register_deposit,
//     Some(
//       Refundable {
//         start_hash: mock_start_hash,
//         share_token: mock_share_token,
//         funds_controlled: mock_current_fundraised_amount,
//       },
//     ),
//     RemoveEmptyInstance,
//     mock_utxo_ref(0, 0),
//     tx,
//   )
// }

test s1_spend_fail_remove_empty_instance_wih_share_not_burnt() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: False,
        is_token_burnt: True,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_remove_empty_instance_wih_token_not_burnt() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: False,
        is_proposer_signed: True,
      },
      mock_current_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_remove_empty_instance_wih_proposer_not_signed() {
  let tx =
    mock_remove_empty_instance_tx(
      RemoveEmptyInstanceTestCase {
        is_only_one_inputed: True,
        // is_deadline_passed: True,
        is_shares_burnt: True,
        is_token_burnt: True,
        is_proposer_signed: False,
      },
      mock_current_fundraised_amount,
    )

  !spend.spend.spend(
    mock_delegate_pool_id,
    mock_gov_action,
    mock_proposer_key_hash,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_fundraise_target,
    Some(
      Refundable {
        start_hash: mock_start_hash,
        share_token: mock_share_token,
        funds_controlled: mock_current_fundraised_amount,
      },
    ),
    RemoveEmptyInstance,
    mock_utxo_ref(0, 0),
    tx,
  )
}
