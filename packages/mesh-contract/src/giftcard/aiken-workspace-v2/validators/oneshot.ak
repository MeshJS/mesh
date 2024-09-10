use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{PolicyId, from_asset, zero}
use cardano/transaction.{Input, OutputReference, Transaction, placeholder} as tx
use mocktail.{complete, mint, mocktail_tx, tx_in}
use mocktail/virgin_address.{mock_pub_key_address}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}

validator redeem(token_name: ByteArray, policy_id: ByteArray) {
  spend(_d: Option<Data>, _r: Data, _input: OutputReference, tx: Transaction) {
    let Transaction { mint, .. } = tx
    expect [Pair(asset_name, amount)] =
      mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()
    amount == -1 && asset_name == token_name
  }

  else(_) {
    fail
  }
}

pub type Action {
  Mint
  Burn
}

validator gift_card(token_name: ByteArray, utxo_ref: OutputReference) {
  mint(rdmr: Action, policy_id: PolicyId, tx: Transaction) {
    let Transaction { inputs, mint, .. } = tx
    expect [Pair(asset_name, amount)] =
      mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()
    when rdmr is {
      Mint -> {
        expect Some(_input) =
          list.find(inputs, fn(input) { input.output_reference == utxo_ref })
        amount == 1 && asset_name == token_name
      }
      Burn -> amount == -1 && asset_name == token_name
    }
  }

  else(_) {
    fail
  }
}

type TestCase {
  is_mint_info_correct: Bool,
  is_token_name_correct: Bool,
}

fn get_mint_test_tx(test_case: TestCase) -> Transaction {
  let TestCase { is_mint_info_correct, is_token_name_correct } = test_case

  let token_name =
    if is_token_name_correct {
      "hello world"
    } else {
      "goodbye"
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 0, zero, mock_pub_key_address(0, None))
    |> mint(is_mint_info_correct, 1, mock_policy_id(0), token_name)
    |> mint(!is_mint_info_correct, 2, mock_policy_id(0), token_name)
    |> complete()
}

test success_mint() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: True, is_token_name_correct: True }
  let tx = get_mint_test_tx(test_case)
  gift_card.mint(test_gift_card_name, utxo, Mint, mock_policy_id(0), tx)
}

test fail_mint_with_more_than_1_mint() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: False, is_token_name_correct: True }
  let tx = get_mint_test_tx(test_case)
  !gift_card.mint(test_gift_card_name, utxo, Mint, mock_policy_id(0), tx)
}

test fail_mint_without_param_name_minted() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: True, is_token_name_correct: False }
  let tx = get_mint_test_tx(test_case)
  !gift_card.mint(test_gift_card_name, utxo, Mint, mock_policy_id(0), tx)
}

fn get_redeem_test_tx(test_case: TestCase) -> Transaction {
  let TestCase { is_mint_info_correct, is_token_name_correct } = test_case

  let token_name =
    if is_token_name_correct {
      "hello world"
    } else {
      "goodbye"
    }

  let mint =
    if is_mint_info_correct {
      from_asset(mock_policy_id(0), token_name, -1)
    } else {
      from_asset(mock_policy_id(0), token_name, -2)
    }

  Transaction { ..placeholder, mint: mint }
}

test success_redeem() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: True, is_mint_info_correct: True }
  let tx = get_redeem_test_tx(test_case)
  redeem.spend(test_gift_card_name, mock_policy_id(0), None, "", utxo, tx) && gift_card.mint(
    test_gift_card_name,
    utxo,
    Burn,
    mock_policy_id(0),
    tx,
  )
}

test fail_redeem_without_correct_name() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: False, is_mint_info_correct: True }
  let tx = get_redeem_test_tx(test_case)
  !(redeem.spend(test_gift_card_name, mock_policy_id(0), None, "", utxo, tx) && gift_card.mint(
    test_gift_card_name,
    utxo,
    Burn,
    mock_policy_id(0),
    tx,
  ))
}

test fail_redeem_without_correct_mint_info() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: True, is_mint_info_correct: False }
  let tx = get_redeem_test_tx(test_case)
  !(redeem.spend(test_gift_card_name, mock_policy_id(0), None, "", utxo, tx) && gift_card.mint(
    test_gift_card_name,
    utxo,
    Burn,
    mock_policy_id(0),
    tx,
  ))
}
