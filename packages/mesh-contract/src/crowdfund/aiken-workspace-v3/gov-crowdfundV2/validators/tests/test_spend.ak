use cardano/address.{Script}
use cardano/assets.{add, from_lovelace}
use cardano/certificate.{
  DelegateBlockProduction, DelegateCredential, DelegateVote, RegisterCredential,
  RegisterDelegateRepresentative, Registered,
}
use cardano/governance.{NoConfidence, ProposalProcedure}
use cardano/transaction.{Transaction}
use gcf_spend as gcf_spend_validator
use mocktail.{
  add_certificate, complete, mock_policy_id, mock_tx_hash, mock_utxo_ref,
  mocktail_tx, tx_in, tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use tests/test_utils.{
  add_proposal_procedure, mock_auth_token, mock_crowdfund_address, mock_deadline,
  mock_delegate_pool_id, mock_drep_register_deposit, mock_fundraise_target,
  mock_funds_controlled, mock_gov_action, mock_gov_action_period,
  mock_gov_address, mock_gov_deposit, mock_proposer_key_hash, mock_share_token,
  mock_stake_hash, mock_stake_register_deposit,
}
use types.{Crowdfund, CrowdfundGovDatum, Proposed, RegisterCerts}

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
    from_lovelace(mock_funds_controlled)
      |> add(mock_stake_hash, "", 1)
      |> add(mock_auth_token, "", 1)

  let input_datum: CrowdfundGovDatum =
    Crowdfund {
      stake_hash: mock_stake_hash,
      share_token: mock_share_token,
      crowdfund_address: mock_crowdfund_address,
      fundraise_target: mock_fundraise_target,
      current_fundraised_amount: mock_funds_controlled,
      allow_over_subscription: False,
      deadline: mock_deadline + mock_gov_action_period,
      expiry_buffer: 3600 * 24,
      min_charge: 10,
    }
  let output_value =
    if is_output_value_correct {
      from_lovelace(
        mock_funds_controlled - mock_stake_register_deposit - mock_drep_register_deposit - mock_gov_deposit,
      )
        |> add(mock_stake_hash, "", 1)
        |> add(mock_auth_token, "", 1)
    } else {
      from_lovelace(
        mock_funds_controlled - mock_stake_register_deposit - mock_drep_register_deposit - mock_gov_deposit + 10,
      )
        |> add(mock_stake_hash, "", 1)
        |> add(mock_auth_token, "", 1)
    }

  let output_datum: CrowdfundGovDatum =
    if is_output_datum_correct {
      Proposed {
        stake_hash: mock_stake_hash,
        share_token: mock_share_token,
        funds_controlled: mock_funds_controlled,
        deadline: mock_deadline + mock_gov_action_period,
      }
    } else {
      Proposed {
        stake_hash: mock_stake_hash,
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
        output_value |> add(mock_policy_id(999), mock_stake_hash, 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> tx_out(!is_only_one_outputed, mock_gov_address, output_value)
    |> complete()
    |> add_certificate(
        is_stake_cert_register,
        RegisterCredential {
          credential: Script(mock_stake_hash),
          deposit: Never,
        },
      )
    |> add_certificate(
        is_drep_cert_register,
        RegisterDelegateRepresentative {
          delegate_representative: Script(mock_stake_hash),
          deposit: drep_deposit,
        },
      )
    |> add_certificate(
        is_stake_delegated,
        DelegateCredential {
          credential: Script(mock_stake_hash),
          delegate: DelegateBlockProduction {
            stake_pool: mock_delegate_pool_id,
          },
        },
      )
    |> add_certificate(
        is_vote_delegated,
        DelegateCredential {
          credential: Script(mock_stake_hash),
          delegate: DelegateVote {
            delegate_representative: Registered(Script(mock_stake_hash)),
          },
        },
      )
    |> add_proposal_procedure(
        is_gov_proposed,
        ProposalProcedure {
          deposit: mock_gov_deposit,
          return_address: Script(mock_stake_hash),
          governance_action: NoConfidence { ancestor: None },
        },
      )
}

test s1_spend_success_reg_cert() {
  let input_datum: CrowdfundGovDatum =
    Crowdfund {
      stake_hash: mock_stake_hash,
      share_token: mock_share_token,
      crowdfund_address: mock_crowdfund_address,
      fundraise_target: mock_fundraise_target,
      current_fundraised_amount: mock_funds_controlled,
      allow_over_subscription: False,
      deadline: mock_deadline + mock_gov_action_period,
      expiry_buffer: 3600 * 24,
      min_charge: 10,
    }
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

  gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_not_crowdfund_state() {
  let input_datum: CrowdfundGovDatum =
    Proposed {
      stake_hash: mock_stake_hash,
      share_token: mock_share_token,
      funds_controlled: mock_funds_controlled,
      deadline: mock_deadline + mock_gov_action_period,
    }
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_more_than_one_input() fail {
  let input_datum: CrowdfundGovDatum =
    Crowdfund {
      stake_hash: mock_stake_hash,
      share_token: mock_share_token,
      crowdfund_address: mock_crowdfund_address,
      fundraise_target: mock_fundraise_target,
      current_fundraised_amount: mock_funds_controlled,
      allow_over_subscription: False,
      deadline: mock_deadline + mock_gov_action_period,
      expiry_buffer: 3600 * 24,
      min_charge: 10,
    }
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

  gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

fn mock_crowdfund_datum_for_tests() -> CrowdfundGovDatum {
  Crowdfund {
    stake_hash: mock_stake_hash,
    share_token: mock_share_token,
    crowdfund_address: mock_crowdfund_address,
    fundraise_target: mock_fundraise_target,
    current_fundraised_amount: mock_funds_controlled,
    allow_over_subscription: False,
    deadline: mock_deadline + mock_gov_action_period,
    expiry_buffer: 3600 * 24,
    min_charge: 10,
  }
}

test s1_spend_fail_reg_cert_with_more_than_one_output() fail {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_incorrect_output_datum() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_output_value_not_clean() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_incorrect_output_value() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_stake_cert_not_reg() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_drep_cert_not_reg() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_drep_deposit_incorrect() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_stake_not_delegated() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_vote_not_delegated() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_reg_cert_with_gov_not_proposed() {
  let input_datum = mock_crowdfund_datum_for_tests()
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

  !gcf_spend_validator.gCf_spend.spend(
    mock_auth_token,
    mock_proposer_key_hash,
    mock_gov_action,
    mock_delegate_pool_id,
    mock_stake_register_deposit,
    mock_drep_register_deposit,
    mock_gov_deposit,
    Some(input_datum),
    RegisterCerts,
    mock_utxo_ref(0, 0),
    tx,
  )
}
