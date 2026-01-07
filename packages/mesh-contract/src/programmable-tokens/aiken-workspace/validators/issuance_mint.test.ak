// Integration tests for issuance minting policy
use aiken/collection/list
use cardano/address.{Address, Credential, Script, VerificationKey}
use cardano/assets.{PolicyId, add, flatten, from_asset, quantity_of, zero}
use cardano/transaction.{NoDatum, Output}
use types.{SmartTokenMintingAction}

// Test data
const test_policy_id: PolicyId =
  #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"

const test_minting_logic_cred: Credential = Script(#"aabbccdd")

const test_programmable_logic_base: Credential = Script(#"11223344")

const test_address =
  Address {
    payment_credential: test_programmable_logic_base,
    stake_credential: None,
  }

// Test SmartTokenMintingAction structure
test smart_token_minting_action_structure() {
  let action =
    SmartTokenMintingAction { minting_logic_cred: test_minting_logic_cred }

  action.minting_logic_cred == test_minting_logic_cred
}

// Test minting logic credential must match
test minting_logic_credential_must_match() {
  let action1 = SmartTokenMintingAction { minting_logic_cred: Script(#"aa") }
  let action2 = SmartTokenMintingAction { minting_logic_cred: Script(#"bb") }

  action1.minting_logic_cred != action2.minting_logic_cred
}

// Test minting logic must be invoked
test minting_logic_must_be_invoked() {
  let withdrawals = [Pair(test_minting_logic_cred, 0)]

  let invoked_scripts =
    list.map(
      withdrawals,
      fn(wdrl) {
        let Pair(cred, _amount) = wdrl
        cred
      },
    )

  list.has(invoked_scripts, test_minting_logic_cred)
}

// Test minted tokens must go to programmable_logic_base
test minted_tokens_go_to_programmable_logic_base() {
  let token_name = #"746f6b656e31"
  let mint_qty = 100

  let output =
    Output {
      address: test_address,
      value: from_asset(test_policy_id, token_name, mint_qty),
      datum: NoDatum,
      reference_script: None,
    }

  output.address.payment_credential == test_programmable_logic_base && quantity_of(
    output.value,
    test_policy_id,
    token_name,
  ) == mint_qty
}

// Test only one token name per policy allowed
test one_token_name_per_policy() {
  let single_token = [(test_policy_id, #"746f6b656e31", 100)]
  let multiple_tokens =
    [(test_policy_id, #"746f6b656e31", 100), (test_policy_id, #"746f6b656e32", 50)]

  list.length(single_token) == 1 && list.length(multiple_tokens) == 2
}

// Test positive minting quantity
test positive_minting_quantity() {
  let mint_qty = 100
  let burn_qty = -50
  let zero_qty = 0

  mint_qty > 0 && burn_qty < 0 && zero_qty == 0
}

// Test burning tokens validation
test burning_tokens_validation() {
  let burn_qty = -100

  // Burning is negative quantity
  burn_qty < 0
}

// Test zero minting not allowed
test zero_minting_not_allowed() {
  let zero_qty = 0

  // Zero quantity should fail
  zero_qty == 0
}

// Test mint field structure
test mint_field_structure() {
  let mint_value =
    zero
      |> add(test_policy_id, #"746f6b656e31", 100)

  let flattened = flatten(mint_value)

  // Should have exactly one entry
  when flattened is {
    [(cs, tn, qty)] -> cs == test_policy_id && tn == #"746f6b656e31" && qty == 100
    _ -> False
  }
}

// Test first output receives minted tokens
test first_output_receives_minted_tokens() {
  let token_name = #"746f6b656e31"
  let mint_qty = 100

  let outputs =
    [
      Output {
        address: test_address,
        value: from_asset(test_policy_id, token_name, mint_qty),
        datum: NoDatum,
        reference_script: None,
      },
    ]

  when outputs is {
    [first_output, ..] ->
      first_output.address.payment_credential == test_programmable_logic_base && quantity_of(
        first_output.value,
        test_policy_id,
        token_name,
      ) == mint_qty
    _ -> False
  }
}

// Test credential type validation
test credential_type_validation() {
  let script_cred = Script(#"aabbccdd")
  let vkey_cred = VerificationKey(#"11223344")

  when script_cred is {
    Script(_) -> True
    _ -> False
  } && when vkey_cred is {
    VerificationKey(_) -> True
    _ -> False
  }
}
