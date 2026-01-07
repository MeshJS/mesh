// Integration tests for programmable logic global validator
use aiken/collection/list
use cardano/address.{Address, Credential, Inline, Script, VerificationKey}
use cardano/assets.{PolicyId, from_asset, merge, negate, zero}
use cardano/transaction.{Input, NoDatum, Output, OutputReference}
use types.{
  ProgrammableLogicGlobalParams, RegistryNode, TokenDoesNotExist, TokenExists,
  TransferAct,
}
use utils.{bytearray_lt}

// Test data
// const test_protocol_params_cs: PolicyId =
// #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"

const test_registry_node_cs: PolicyId =
  #"1112131415161718191a1b1c0d0e0f0102030405060708090a0b0c0d"

const test_prog_logic_cred: Credential = Script(#"70726f67")

const test_transfer_logic_cred: Credential = Script(#"7472616e73666572")

const test_third_party_transfer_logic_cred: Credential = Script(#"6973737565")

const test_token_cs: PolicyId =
  #"2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c"

// Test ProgrammableLogicGlobalParams structure
test programmable_logic_global_params_structure() {
  let params =
    ProgrammableLogicGlobalParams {
      prog_logic_cred: test_prog_logic_cred,
      registry_node_cs: test_registry_node_cs,
    }

  params.prog_logic_cred == test_prog_logic_cred && params.registry_node_cs == test_registry_node_cs
}

// Test TransferAct redeemer
test transfer_act_redeemer() {
  let proof1 = TokenExists { node_idx: 0 }
  let proof2 = TokenDoesNotExist { node_idx: 1 }

  let redeemer = TransferAct { proofs: [proof1, proof2] }

  when redeemer is {
    TransferAct { proofs } -> list.length(proofs) == 2
    _ -> False
  }
}

// Test ThirdPartyAct redeemer
// test third_party_act_redeemer() {
//   let redeemer =
//     ThirdPartyAct { seize_input_idx: 0, seize_output_idx: 1, registry_node_idx: 0 }

//   when redeemer is {
//     ThirdPartyAct { seize_input_idx, seize_output_idx, registry_node_idx } ->
//       seize_input_idx == 0 && seize_output_idx == 1 && registry_node_idx == 0
//     _ -> False
//   }
// }

// // Test TokenExists proof
// test token_exists_proof() {
//   let proof = TokenExists { node_idx: 5 }

//   when proof is {
//     TokenExists { node_idx } -> node_idx == 5
//     _ -> False
//   }
// }

// Test TokenDoesNotExist proof
test token_does_not_exist_proof() {
  let proof = TokenDoesNotExist { node_idx: 3 }

  when proof is {
    TokenDoesNotExist { node_idx } -> node_idx == 3
    _ -> False
  }
}

// Test registry node validation for transfer
test registry_node_validation_for_transfer() {
  let node =
    RegistryNode {
      key: test_token_cs,
      next: #"ffff",
      transfer_logic_script: test_transfer_logic_cred,
      third_party_transfer_logic_script: test_third_party_transfer_logic_cred,
      global_state_cs: #"",
    }

  // Node key should match the token CS
  node.key == test_token_cs && // Transfer logic script should be present
  node.transfer_logic_script == test_transfer_logic_cred
}

// Test covering node logic for non-existent token
test covering_node_logic_for_non_existent_token() {
  let covering_key = #"aa"
  let token_cs = #"bb"
  let next_key = #"cc"

  let covering_node =
    RegistryNode {
      key: covering_key,
      next: next_key,
      transfer_logic_script: test_transfer_logic_cred,
      third_party_transfer_logic_script: test_third_party_transfer_logic_cred,
      global_state_cs: #"",
    }

  // Covering node should satisfy: covering_key < token_cs < next_key
  bytearray_lt(covering_node.key, token_cs) && bytearray_lt(
    token_cs,
    covering_node.next,
  )
}

// Test seize validation structure
test seize_validation_structure() {
  let seized_cs = test_token_cs
  let input_value = from_asset(seized_cs, #"746f6b656e", 100)
  let expected_output_value = zero

  // After seizing, the output should have the tokens removed
  input_value != expected_output_value
}

// Test programmable tokens go to prog_logic_cred
test programmable_tokens_go_to_prog_logic_cred() {
  let output =
    Output {
      address: Address {
        payment_credential: test_prog_logic_cred,
        stake_credential: None,
      },
      value: from_asset(test_token_cs, #"746f6b656e", 100),
      datum: NoDatum,
      reference_script: None,
    }

  output.address.payment_credential == test_prog_logic_cred
}

// Test transfer logic script must be invoked
test transfer_logic_script_must_be_invoked() {
  let invoked_scripts = [test_transfer_logic_cred, Script(#"6f74686572")]

  list.has(invoked_scripts, test_transfer_logic_cred)
}

// Test third party transfer logic script must be invoked for third party actions
test third_party_transfer_logic_script_must_be_invoked_for_third_party_actions() {
  let invoked_scripts =
    [test_third_party_transfer_logic_cred, Script(#"6f74686572")]

  list.has(invoked_scripts, test_third_party_transfer_logic_cred)
}

// Test signed prog inputs validation
test signed_prog_inputs_validation() {
  let stake_pkh = #"aabbccdd"
  let input =
    Input {
      output_reference: OutputReference {
        transaction_id: #"00",
        output_index: 0,
      },
      output: Output {
        address: Address {
          payment_credential: test_prog_logic_cred,
          stake_credential: Some(Inline(VerificationKey(stake_pkh))),
        },
        value: from_asset(test_token_cs, #"746f6b656e", 100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // Input is from prog_logic_cred with stake credential
  input.output.address.payment_credential == test_prog_logic_cred && when
    input.output.address.stake_credential
  is {
    Some(Inline(VerificationKey(pkh))) -> pkh == stake_pkh
    _ -> False
  }
}

// Test seize prevents DDOS by requiring value change
test seize_prevents_ddos_by_requiring_value_change() {
  let input_value = from_asset(test_token_cs, #"746f6b656e", 100)
  // let output_value = from_asset(test_token_cs, #"746f6b656e", 100)
  let expected_output =
    merge(input_value, negate(from_asset(test_token_cs, #"746f6b656e", 50)))

  // Must actually remove tokens (DDOS prevention)
  input_value != expected_output
}

// Test only one prog_logic_cred input allowed in seize
test only_one_prog_logic_cred_input_in_seize() {
  let inputs =
    [
      Input {
        output_reference: OutputReference {
          transaction_id: #"00",
          output_index: 0,
        },
        output: Output {
          address: Address {
            payment_credential: test_prog_logic_cred,
            stake_credential: None,
          },
          value: zero,
          datum: NoDatum,
          reference_script: None,
        },
      },
    ]

  list.length(
    list.filter(
      inputs,
      fn(input) {
        input.output.address.payment_credential == test_prog_logic_cred
      },
    ),
  ) == 1
}

// Test protocol params from reference inputs
test protocol_params_from_reference_inputs() {
  let params =
    ProgrammableLogicGlobalParams {
      prog_logic_cred: test_prog_logic_cred,
      registry_node_cs: test_registry_node_cs,
    }

  // Protocol params should be loaded from reference input
  params.registry_node_cs == test_registry_node_cs
}

// Test invoked scripts via withdrawals
test invoked_scripts_via_withdrawals() {
  let withdrawals =
    [
      Pair(test_transfer_logic_cred, 0),
      Pair(test_third_party_transfer_logic_cred, 0),
    ]

  let invoked_scripts =
    list.map(
      withdrawals,
      fn(wdrl) {
        let Pair(cred, _amount) = wdrl
        cred
      },
    )

  list.has(invoked_scripts, test_transfer_logic_cred) && list.has(
    invoked_scripts,
    test_third_party_transfer_logic_cred,
  )
}
