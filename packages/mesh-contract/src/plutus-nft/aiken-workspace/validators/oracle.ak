use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/assets.{add, flatten, from_asset}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, find_input,
}
use mocktail.{
  complete, mint, mocktail_tx, required_signer_hash, tx_in, tx_in_inline_datum,
  tx_out, tx_out_inline_datum,
}
use mocktail/virgin_address.{mock_script_address}
use mocktail/virgin_key_hash.{mock_policy_id, mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use vodka_extra_signatories.{key_signed}
use vodka_inputs.{inputs_at_with_policy}
use vodka_mints.{check_policy_only_burn}
use vodka_outputs.{outputs_at_with_policy}

pub type OracleDatum {
  count: Int,
  owner_key: VerificationKeyHash,
}

pub type OracleRedeemer {
  MintPlutusNFT
  StopOracle
}

validator account_oracle {
  spend(
    datum_opt: Option<OracleDatum>,
    redeemer: OracleRedeemer,
    input: OutputReference,
    tx: Transaction,
  ) {
    let Transaction { mint, inputs, outputs, extra_signatories, .. } = tx
    expect Some(OracleDatum { count, owner_key }) = datum_opt
    expect Some(own_input) = find_input(inputs, input)
    expect [(oracle_nft_policy, _, _)] =
      list.filter(flatten(own_input.output.value), fn(x) { x.1st != "" })
    let own_address = own_input.output.address
    when
      (
        redeemer,
        inputs_at_with_policy(inputs, own_address, oracle_nft_policy),
        outputs_at_with_policy(outputs, own_address, oracle_nft_policy),
      )
    is {
      (MintPlutusNFT, [_], [only_output]) -> {
        let is_output_value_clean = list.length(flatten(only_output.value)) == 2
        let is_count_updated =
          only_output.datum == InlineDatum(
            OracleDatum { count: count + 1, owner_key },
          )
        let is_owner_signed = key_signed(extra_signatories, owner_key)
        is_output_value_clean? && is_owner_signed? && is_count_updated?
      }
      (StopOracle, [_], _) -> {
        let is_oracle_nft_burnt =
          check_policy_only_burn(mint, oracle_nft_policy)
        let is_owner_signed = key_signed(extra_signatories, owner_key)
        is_oracle_nft_burnt? && is_owner_signed?
      }
      _ -> False
    }
  }

  else(_) {
    fail
  }
}

test success_mint() {
  let datum = OracleDatum { count: 0, owner_key: mock_pub_key_hash(0) }
  let redeemer = MintPlutusNFT
  let input_value =
    from_asset(mock_policy_id(0), "", 1) |> add("", "", 2_000_000)

  let tx =
    mocktail_tx()
      |> tx_in(True, mock_tx_hash(0), 0, input_value, mock_script_address(0, None))
      |> tx_in_inline_datum(
          True,
          OracleDatum { count: 0, owner_key: mock_pub_key_hash(0) },
        )
      |> tx_out(True, mock_script_address(0, None), input_value)
      |> tx_out_inline_datum(
          True,
          OracleDatum { count: 1, owner_key: mock_pub_key_hash(0) },
        )
      |> mint(True, 1, mock_policy_id(1), "collection (0)")
      |> required_signer_hash(True, mock_pub_key_hash(0))
      |> complete()

  account_oracle.spend(Some(datum), redeemer, mock_utxo_ref(0, 0), tx)
}
