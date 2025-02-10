use cardano/assets.{PolicyId, add, from_asset, from_lovelace}
use cardano/transaction.{Input, Transaction, placeholder}
use content_ownership/types.{RBurn, RMint}
use mocktail/virgin_address.{mock_pub_key_address}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_utxo_ref}
use mocktail/virgin_outputs.{mock_pub_key_output}
use one_time_minting_policy

test success_mint() {
  let redeemer = RMint
  let input_utxo = mock_utxo_ref(0, 1)
  let policy_id: PolicyId =
    #"1c1b7afe8affbee1505cf3ec5a58bd2734d4ffdfcc9b9f059625bd76"

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", 1),
      inputs: [
        Input {
          output_reference: input_utxo,
          output: mock_pub_key_output(
            mock_pub_key_address(0, None),
            from_lovelace(1000000),
          ),
        },
      ],
    }

  one_time_minting_policy.one_time_minting_policy.mint(
    input_utxo,
    redeemer,
    policy_id,
    tx,
  )
}

test fail_mint_no_utxo_ref_supply() {
  let redeemer = RMint
  let policy_id = mock_policy_id(0)

  !one_time_minting_policy.one_time_minting_policy.mint(
    mock_utxo_ref(0, 0),
    redeemer,
    policy_id,
    placeholder,
  )
}

test success_burn() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(0)

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", -1) }
  one_time_minting_policy.one_time_minting_policy.mint(
    mock_utxo_ref(0, 0),
    redeemer,
    policy_id,
    tx,
  )
}

test success_burn_with_other_minting() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(0)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", -1) |> add(mock_policy_id(1), "", 1),
    }
  one_time_minting_policy.one_time_minting_policy.mint(
    mock_utxo_ref(0, 0),
    redeemer,
    policy_id,
    tx,
  )
}

test fail_burn_with_mint() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(0)

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", 1) }
  !one_time_minting_policy.one_time_minting_policy.mint(
    mock_utxo_ref(0, 0),
    redeemer,
    policy_id,
    tx,
  )
}

test fail_burn_with_mix() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(0)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", -1) |> add(policy_id, "1", 1),
    }
  !one_time_minting_policy.one_time_minting_policy.mint(
    mock_utxo_ref(0, 0),
    redeemer,
    policy_id,
    tx,
  )
}
