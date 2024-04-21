use aiken/dict
use aiken/list
use aiken/transaction.{
  Input, OutputReference, ScriptContext, Transaction, placeholder,
} as tx
use aiken/transaction/value.{from_asset, to_minted_value, zero}
use sidan_placeholder/address.{mock_pub_key_address}
use sidan_placeholder/key_hex.{mock_policy_id}
use sidan_placeholder/output_reference.{mock_utxo_ref}
use sidan_placeholder/outputs.{mock_pub_key_output}

validator(token_name: ByteArray, policy_id: ByteArray) {
  fn redeem(_d: Data, _r: Data, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, .. } = ctx
    let Transaction { mint, .. } = transaction
    expect [(asset_name, amount)] =
      mint
        |> value.from_minted_value
        |> value.tokens(policy_id)
        |> dict.to_list()
    amount == -1 && asset_name == token_name
  }
}

type Action {
  Mint
  Burn
}

validator(token_name: ByteArray, utxo_ref: OutputReference) {
  fn gift_card(rdmr: Action, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    expect tx.Mint(policy_id) = purpose
    let Transaction { inputs, mint, .. } = transaction
    expect [(asset_name, amount)] =
      mint
        |> value.from_minted_value
        |> value.tokens(policy_id)
        |> dict.to_list()
    when rdmr is {
      Mint -> {
        expect Some(_input) =
          list.find(inputs, fn(input) { input.output_reference == utxo_ref })
        amount == 1 && asset_name == token_name
      }
      Burn -> amount == -1 && asset_name == token_name
    }
  }
}

type TestCase {
  is_mint_info_correct: Bool,
  is_token_name_correct: Bool,
}

fn get_mint_test_tx(test_case: TestCase) -> Transaction {
  let TestCase { is_mint_info_correct, is_token_name_correct } = test_case

  let inputs =
    [
      Input {
        output_reference: mock_utxo_ref(0, 0),
        output: mock_pub_key_output(mock_pub_key_address(0, None), zero()),
      },
    ]

  let token_name =
    if is_token_name_correct {
      "hello world"
    } else {
      "goodbye"
    }

  let mint =
    if is_mint_info_correct {
      from_asset(mock_policy_id(0), token_name, 1)
    } else {
      from_asset(mock_policy_id(0), token_name, 2)
    }
      |> to_minted_value

  Transaction { ..placeholder(), inputs: inputs, mint: mint }
}

test success_mint() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: True, is_token_name_correct: True }
  let tx = get_mint_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  gift_card(test_gift_card_name, utxo, Mint, ctx)
}

test fail_mint_with_more_than_1_mint() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: False, is_token_name_correct: True }
  let tx = get_mint_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  !gift_card(test_gift_card_name, utxo, Mint, ctx)
}

test fail_mint_without_param_name_minted() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_mint_info_correct: True, is_token_name_correct: False }
  let tx = get_mint_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  !gift_card(test_gift_card_name, utxo, Mint, ctx)
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
      |> to_minted_value

  Transaction { ..placeholder(), mint: mint }
}

test success_redeem() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: True, is_mint_info_correct: True }
  let tx = get_redeem_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  redeem(test_gift_card_name, mock_policy_id(0), "", "", ctx) && gift_card(
    test_gift_card_name,
    utxo,
    Burn,
    ctx,
  )
}

test fail_redeem_without_correct_name() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: False, is_mint_info_correct: True }
  let tx = get_redeem_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  !(redeem(test_gift_card_name, mock_policy_id(0), "", "", ctx) && gift_card(
    test_gift_card_name,
    utxo,
    Burn,
    ctx,
  ))
}

test fail_redeem_without_correct_mint_info() {
  let test_gift_card_name = "hello world"
  let utxo = mock_utxo_ref(0, 0)
  let test_case =
    TestCase { is_token_name_correct: True, is_mint_info_correct: False }
  let tx = get_redeem_test_tx(test_case)
  let ctx =
    ScriptContext { transaction: tx, purpose: tx.Mint(mock_policy_id(0)) }
  !(redeem(test_gift_card_name, mock_policy_id(0), "", "", ctx) && gift_card(
    test_gift_card_name,
    utxo,
    Burn,
    ctx,
  ))
}
