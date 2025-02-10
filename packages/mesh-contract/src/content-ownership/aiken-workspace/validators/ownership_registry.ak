use aiken/collection/list
use aiken/collection/pairs
use cardano/assets.{PolicyId, flatten, negate, without_lovelace}
use cardano/transaction.{InlineDatum, OutputReference, Spend, Transaction}
use content_ownership/types.{
  ContentRegistryRedeemer, CreateContent, CreateOwnershipRecord, OracleDatum,
  OwnershipRegistryDatum, OwnershipRegistryRedeemer, StopOwnershipRegistry,
  TransferOwnership,
}
use vodka_extra_signatories.{key_signed}
use vodka_inputs.{
  inputs_at, inputs_at_with_policy, inputs_token_quantity, inputs_with,
}
use vodka_outputs.{outputs_at_with_policy}

pub fn update_ownership_registry_at(
  registry: List<List<ByteArray>>,
  index: Int,
  new_value: List<ByteArray>,
) -> List<List<ByteArray>> {
  let spanned_registry = list.span(registry, index)
  expect Some(dropped_head_tail) = list.tail(spanned_registry.2nd)
  let updated_tail = list.push(dropped_head_tail, new_value)
  list.concat(spanned_registry.1st, updated_tail)
}

validator ownership_registry(oracle_nft: PolicyId) {
  spend(
    _datum: Option<OwnershipRegistryDatum>,
    redeemer: OwnershipRegistryRedeemer,
    _utxo: OutputReference,
    tx: Transaction,
  ) {
    let Transaction {
      reference_inputs,
      redeemers,
      inputs,
      outputs,
      extra_signatories,
      mint,
      ..
    } = tx
    when inputs_with(reference_inputs, oracle_nft, "") is {
      [oracle_ref_utxo] -> {
        expect InlineDatum(inline_datum) = oracle_ref_utxo.output.datum
        when redeemer is {
          CreateOwnershipRecord -> {
            expect OracleDatum { content_registry_address, .. }: OracleDatum =
              inline_datum
            when inputs_at(inputs, content_registry_address) is {
              [content_input] -> {
                expect Some(raw_redeemer) =
                  pairs.get_first(
                    redeemers,
                    Spend(content_input.output_reference),
                  )
                expect parsed_redeemer: ContentRegistryRedeemer = raw_redeemer
                when parsed_redeemer is {
                  CreateContent { content_hash: _, owner: _ } -> True
                  _ -> False
                }
              }
              _ -> False
            }
          }
          TransferOwnership { new_owner_token, content_number } -> {
            expect OracleDatum {
              ownership_registry_address,
              ownership_registry_ref_token,
              ..
            }: OracleDatum = inline_datum
            when
              (
                inputs_at_with_policy(
                  inputs,
                  ownership_registry_address,
                  ownership_registry_ref_token,
                ),
                outputs_at_with_policy(
                  outputs,
                  ownership_registry_address,
                  ownership_registry_ref_token,
                ),
              )
            is {
              ([ownership_input], [ownership_output]) -> {
                expect InlineDatum(raw_input_datum) =
                  ownership_input.output.datum
                expect input_datum: OwnershipRegistryDatum = raw_input_datum
                expect InlineDatum(raw_output_datum) = ownership_output.datum
                expect output_datum: OwnershipRegistryDatum = raw_output_datum
                expect Some(original_owner) =
                  list.at(input_datum.registry, content_number)
                expect [policy_id, asset_name] = original_owner
                let is_original_owner_authorized =
                  inputs_token_quantity(inputs, (policy_id, asset_name)) > 0
                let is_registry_updated =
                  output_datum == OwnershipRegistryDatum {
                    count: input_datum.count,
                    registry: update_ownership_registry_at(
                      input_datum.registry,
                      content_number,
                      new_owner_token,
                    ),
                  }
                let is_registry_value_clean =
                  list.length(flatten(ownership_output.value)) == 2
                is_original_owner_authorized && is_registry_updated && is_registry_value_clean
              }
              _ -> False
            }
          }
          StopOwnershipRegistry -> {
            expect OracleDatum {
              stop_key,
              ownership_registry_ref_token,
              ownership_registry_address,
              ..
            }: OracleDatum = inline_datum
            when
              inputs_at_with_policy(
                inputs,
                ownership_registry_address,
                ownership_registry_ref_token,
              )
            is {
              [ownership_input] -> {
                let is_stop_key_signed = key_signed(extra_signatories, stop_key)
                let ownership_ref_token =
                  ownership_input.output.value |> without_lovelace
                let is_ref_token_burned = mint == negate(ownership_ref_token)
                is_stop_key_signed && is_ref_token_burned
              }
              _ -> False
            }
          }
        }
      }

      _ -> False
    }
  }

  else(_) {
    fail
  }
}
