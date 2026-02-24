use cardano/assets.{add, from_asset, from_lovelace}
use cardano/transaction.{OutputReference, Spend, Transaction, placeholder}
use mocktail.{
  add_redeemer, complete, mint, mock_policy_id, mock_tx_hash, mocktail_tx, tx_in,
}
use share_token/mint as share_token_mint
use tests/utils.{
  mock_auth_token, mock_completion_script, mock_crowdfund_address,
  mock_share_token,
}
use types.{ContributeFund, RBurn, RMint}

test s2_mint_success_mint() {
  let redeemer = RMint
  let auth_input =
    from_lovelace(20000000) |> add(mock_auth_token, mock_completion_script, 1)

  let policy_id = mock_share_token

  let auth_token_redeemer: Data = ContributeFund
  let tx =
    mocktail_tx()
      |> tx_in(True, mock_tx_hash(0), 0, auth_input, mock_crowdfund_address)
      |> mint(True, 1, policy_id, mock_completion_script)
      |> complete()
      |> add_redeemer(
          True,
          Pair(
            Spend(
              OutputReference {
                transaction_id: mock_tx_hash(0),
                output_index: 0,
              },
            ),
            auth_token_redeemer,
          ),
        )

  share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}

test s2_mint_fail_mint_no_auth_token_input() fail {
  let redeemer = RMint
  let policy_id = mock_share_token

  let tx =
    mocktail_tx()
      |> mint(True, 1, policy_id, mock_completion_script)
      |> complete()
  share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}

test s2_mint_fail_mint_no_auth_token_redeemer() fail {
  let redeemer = RMint
  let auth_input =
    from_lovelace(20000000) |> add(mock_auth_token, mock_completion_script, 1)
  let policy_id = mock_share_token

  let tx =
    mocktail_tx()
      |> tx_in(True, mock_tx_hash(0), 0, auth_input, mock_crowdfund_address)
      |> mint(True, 1, policy_id, mock_completion_script)
      |> complete()
  share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}

test s2_mint_success_burn() {
  let redeemer = RBurn
  let policy_id = mock_share_token

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", -1) }
  share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}

test s2_mint_success_burn_with_other_minting() {
  let redeemer = RBurn
  let policy_id = mock_share_token

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", -1) |> add(mock_policy_id(999), "", 1),
    }
  share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}

test s2_mint_fail_burn_with_mint() {
  let redeemer = RBurn
  let policy_id = mock_share_token

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", 1) }
  !share_token_mint.share_token.mint(mock_auth_token, redeemer, policy_id, tx)
}
