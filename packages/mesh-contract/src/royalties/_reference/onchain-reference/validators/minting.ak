use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/time.{PosixTime}
use aiken/transaction.{Mint, ScriptContext, Transaction}
use aiken/transaction/value
use onchain_reference/common.{VerificationKeyHash}

type Redeemer {
  MintNft
  BurnNft
}

// a simple timelocked MP which checks only for script owner signature and deadline
validator(lock_time: PosixTime, owner: VerificationKeyHash) {
  fn minting_validator(redeemer: Redeemer, ctx: ScriptContext) -> Bool {
    // deadline has not passed && owner has signed
    expect
      is_not_expired(ctx.transaction, lock_time)? && list.has(
        ctx.transaction.extra_signatories,
        owner,
      )?
    expect Some((_, _, quantity)) =
      ctx.transaction.mint
        |> value.from_minted_value
        |> value.flatten
        |> list.at(0)
    // check that stated purpose is accurate
    when redeemer is {
      MintNft -> (quantity >= 1)?
      BurnNft -> (quantity <= -1)?
    }
  }
}

// check posixtime against tx validity window
fn is_not_expired(tx: Transaction, lock_time: PosixTime) {
  when tx.validity_range.upper_bound.bound_type is {
    Finite(bound_time) -> bound_time <= lock_time
    _ -> False
  }
}

// ############### TESTS ###############

const mock_timestamp = 1704063599000

// 2023-12-31 23:59:59
const mock_owner = "some_fake_address_hash"

const mock_policy_id = "some_fake_policy_id"

const mock_asset_name = "some_fake_asset_name"

test should_mint_nft() {
  let redeemer = MintNft
  // Happy path with 1 token minted
  let ctx =
    ScriptContext {
      purpose: Mint(mock_policy_id),
      transaction: get_base_transaction(1604063500000, 1704063500000, 1),
    }
  minting_validator(mock_timestamp, mock_owner, redeemer, ctx) == True
}

test should_burn_nft() {
  let redeemer = BurnNft
  // Happy path with -1 tokens minted (1 token burned)
  let ctx =
    ScriptContext {
      purpose: Mint(mock_policy_id),
      transaction: get_base_transaction(1604063500000, 1704063500000, -1),
    }
  minting_validator(mock_timestamp, mock_owner, redeemer, ctx) == True
}

test should_succeed_mint_multiple_asset_amount() {
  let redeemer = MintNft
  // Happy path with 5 tokens minted
  let ctx =
    ScriptContext {
      purpose: Mint(mock_policy_id),
      transaction: get_base_transaction(1604063500000, 1704063500000, 5),
    }
  minting_validator(mock_timestamp, mock_owner, redeemer, ctx) == True
}

test should_throw_error_by_exceeded_time_lock() fail {
  let redeemer = MintNft
  let ctx =
    ScriptContext {
      purpose: Mint(mock_policy_id),
      transaction: get_base_transaction(1604063500000, mock_timestamp, 1),
    }
  // parameterize with a posixtime before the end of the tx validity window
  minting_validator(mock_timestamp - 5000, mock_owner, redeemer, ctx)
}

test should_throw_error_by_missing_signer() fail {
  let redeemer = MintNft
  let ctx =
    ScriptContext {
      purpose: Mint(mock_policy_id),
      transaction: get_base_transaction(1604063500000, 1704063500000, 1),
    }
  // Parameterize off of different vkh
  minting_validator(mock_timestamp, "some_other_owner", redeemer, ctx)
}

fn get_base_transaction(from: Int, to: Int, quantity: Int) {
  Transaction {
    ..transaction.placeholder(),
    extra_signatories: [mock_owner],
    mint: value.from_asset(mock_policy_id, mock_asset_name, quantity)
      |> value.to_minted_value,
    validity_range: Interval {
      lower_bound: IntervalBound {
        bound_type: Finite(from),
        is_inclusive: True,
      },
      upper_bound: IntervalBound { bound_type: Finite(to), is_inclusive: True },
    },
  }
}
