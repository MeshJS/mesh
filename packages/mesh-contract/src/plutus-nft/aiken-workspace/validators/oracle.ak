use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/assets.{flatten}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, find_input,
}
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
