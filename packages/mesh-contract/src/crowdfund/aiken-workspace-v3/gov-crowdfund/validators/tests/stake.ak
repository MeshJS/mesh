use cardano/assets.{from_lovelace}
use cardano/certificate.{RegisterCredential}
use cardano/script_context.{Publishing, ScriptContext}
use cardano/transaction.{OutputReference, Spend, Transaction}
use mocktail.{
  add_redeemer, complete, mock_script_credential, mock_tx_hash, mocktail_tx,
  tx_in,
}
use stake
use tests/utils.{
  mock_crowdfund_gov_address, mock_fundraise_target, mock_spend_script_hash,
}
use types.{Deregister, DeregisterCerts, Register, RegisterCerts}

type StakeTestCase {
  is_only_one_auth_inputed: Bool,
}

fn mock_stake_tx(
  test_case: StakeTestCase,
  only_input_redeemer: Data,
) -> Transaction {
  let StakeTestCase { is_only_one_auth_inputed } = test_case
  let only_input = from_lovelace(mock_fundraise_target)
  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, only_input, mock_crowdfund_gov_address)
    |> tx_in(
        !is_only_one_auth_inputed,
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

test s2_success_stake_with_reg() {
  let only_input_redeemer: Data = RegisterCerts

  let ctx =
    ScriptContext {
      transaction: mock_stake_tx(
        StakeTestCase { is_only_one_auth_inputed: True },
        only_input_redeemer,
      ),
      redeemer: Register,
      info: Publishing {
        at: 0,
        certificate: RegisterCredential {
          credential: mock_script_credential(0),
          deposit: Never,
        },
      },
    }
  stake.stake.else(mock_spend_script_hash, ctx)
}

test s2_success_stake_with_dereg() {
  let only_input_redeemer: Data = DeregisterCerts

  let ctx =
    ScriptContext {
      transaction: mock_stake_tx(
        StakeTestCase { is_only_one_auth_inputed: True },
        only_input_redeemer,
      ),
      redeemer: Deregister,
      info: Publishing {
        at: 0,
        certificate: RegisterCredential {
          credential: mock_script_credential(0),
          deposit: Never,
        },
      },
    }
  stake.stake.else(mock_spend_script_hash, ctx)
}

test s2_fail_stake_with_reg_but_deregister_cert() {
  let only_input_redeemer: Data = DeregisterCerts

  let ctx =
    ScriptContext {
      transaction: mock_stake_tx(
        StakeTestCase { is_only_one_auth_inputed: True },
        only_input_redeemer,
      ),
      redeemer: Register,
      info: Publishing {
        at: 0,
        certificate: RegisterCredential {
          credential: mock_script_credential(0),
          deposit: Never,
        },
      },
    }
  !stake.stake.else(mock_spend_script_hash, ctx)
}

test s2_fail_stake_with_dereg_but_register_cert() {
  let only_input_redeemer: Data = RegisterCerts

  let ctx =
    ScriptContext {
      transaction: mock_stake_tx(
        StakeTestCase { is_only_one_auth_inputed: True },
        only_input_redeemer,
      ),
      redeemer: Deregister,
      info: Publishing {
        at: 0,
        certificate: RegisterCredential {
          credential: mock_script_credential(0),
          deposit: Never,
        },
      },
    }
  !stake.stake.else(mock_spend_script_hash, ctx)
}

test s2_fail_stake_with_more_than_one_input_from_hash() fail {
  let only_input_redeemer: Data = RegisterCerts

  let ctx =
    ScriptContext {
      transaction: mock_stake_tx(
        StakeTestCase { is_only_one_auth_inputed: False },
        only_input_redeemer,
      ),
      redeemer: Register,
      info: Publishing {
        at: 0,
        certificate: RegisterCredential {
          credential: mock_script_credential(0),
          deposit: Never,
        },
      },
    }
  stake.stake.else(mock_spend_script_hash, ctx)
}
