use aiken/collection/list
use cardano/assets.{PolicyId, flatten, negate, without_lovelace}
use cardano/transaction.{Datum, InlineDatum, OutputReference, Transaction}
use content_ownership/common.{inputs_token_quantity, key_signed}
use content_ownership/types.{
  ContentRegistryDatum, ContentRegistryRedeemer, CreateContent, OracleDatum,
  OwnershipRegistryDatum, StopContentRegistry, UpdateContent,
}
use vodka_inputs.{inputs_at, inputs_at_with, inputs_at_with_policy, inputs_with}
use vodka_outputs.{outputs_at_with}

pub fn update_content_registry_at(
  registry: List<ByteArray>,
  index: Int,
  new_value: ByteArray,
) -> List<ByteArray> {
  let spanned_registry = list.span(registry, index)
  expect Some(dropped_head_tail) = list.tail(spanned_registry.2nd)
  let updated_tail = list.push(dropped_head_tail, new_value)
  list.concat(spanned_registry.1st, updated_tail)
}

pub fn check_is_content_registry_updated(
  old_datum: Datum,
  new_datum: Datum,
  content_number: Int,
  new_content_hash: ByteArray,
) -> Bool {
  expect InlineDatum(raw_input_datum) = old_datum
  expect input_datum: ContentRegistryDatum = raw_input_datum
  expect InlineDatum(raw_output_datum) = new_datum
  expect output_datum: ContentRegistryDatum = raw_output_datum
  let updated_registry =
    update_content_registry_at(
      input_datum.registry,
      content_number,
      new_content_hash,
    )
  let is_content_registry_updated =
    output_datum == ContentRegistryDatum {
      count: input_datum.count,
      registry: updated_registry,
    }
  is_content_registry_updated
}

validator content_registry(oracle_nft: PolicyId) {
  spend(
    _datum: Option<ContentRegistryDatum>,
    redeemer: ContentRegistryRedeemer,
    _utxo: OutputReference,
    tx: Transaction,
  ) {
    let Transaction {
      reference_inputs,
      inputs,
      outputs,
      extra_signatories,
      mint,
      ..
    } = tx
    when inputs_with(reference_inputs, oracle_nft, "") is {
      [oracle_ref_utxo] -> {
        expect InlineDatum(inline_datum) = oracle_ref_utxo.output.datum
        expect OracleDatum {
          content_registry_address,
          ownership_registry_address,
          content_registry_ref_token,
          ownership_registry_ref_token,
          stop_key,
          ..
        }: OracleDatum = inline_datum
        when redeemer is {
          CreateContent { content_hash, owner } ->
            when
              (
                inputs_at_with_policy(
                  inputs,
                  content_registry_address,
                  content_registry_ref_token,
                ),
                inputs_at_with_policy(
                  inputs,
                  ownership_registry_address,
                  ownership_registry_ref_token,
                ),
              )
            is {
              ([content_input], [ownership_input]) -> {
                expect Some((_, content_ref_token_name, _)) =
                  list.find(
                    flatten(content_input.output.value),
                    fn(token) { token.1st == content_registry_ref_token },
                  )
                expect Some((_, ownership_ref_token_name, _)) =
                  list.find(
                    flatten(ownership_input.output.value),
                    fn(token) { token.1st == ownership_registry_ref_token },
                  )
                expect ([content_output], [ownership_output]) =
                  (
                    outputs_at_with(
                      outputs,
                      content_registry_address,
                      content_registry_ref_token,
                      content_ref_token_name,
                    ),
                    outputs_at_with(
                      outputs,
                      ownership_registry_address,
                      ownership_registry_ref_token,
                      ownership_ref_token_name,
                    ),
                  )
                expect InlineDatum(content_input_raw_datum) =
                  content_input.output.datum
                expect InlineDatum(ownership_input_raw_datum) =
                  ownership_input.output.datum
                expect content_input_datum: ContentRegistryDatum =
                  content_input_raw_datum
                expect ownership_input_datum: OwnershipRegistryDatum =
                  ownership_input_raw_datum
                expect InlineDatum(content_output_raw_datum) =
                  content_output.datum
                expect InlineDatum(ownership_output_raw_datum) =
                  ownership_output.datum
                expect content_output_datum: ContentRegistryDatum =
                  content_output_raw_datum
                expect ownership_output_datum: OwnershipRegistryDatum =
                  ownership_output_raw_datum
                let ref_tokens_equal =
                  content_ref_token_name == ownership_ref_token_name
                let current_count_equal =
                  content_input_datum.count == ownership_input_datum.count
                let content_new_datum_correct =
                  content_output_datum == ContentRegistryDatum {
                    count: content_input_datum.count + 1,
                    registry: list.concat(
                      content_input_datum.registry,
                      [content_hash],
                    ),
                  }
                let ownership_new_datum_correct =
                  ownership_output_datum == OwnershipRegistryDatum {
                    count: ownership_input_datum.count + 1,
                    registry: list.concat(
                      ownership_input_datum.registry,
                      [owner],
                    ),
                  }
                let content_registry_value_clean =
                  list.length(flatten(content_output.value)) == 2
                let ownership_registry_value_clean =
                  list.length(flatten(ownership_output.value)) == 2
                ref_tokens_equal && current_count_equal && content_registry_value_clean && ownership_registry_value_clean && content_new_datum_correct && ownership_new_datum_correct
              }
              _ -> False
            }
          UpdateContent { new_content_hash, content_number } -> {
            expect [ownership_ref_input] =
              inputs_at(reference_inputs, ownership_registry_address)
            expect Some(ref_token) =
              list.head(
                flatten(without_lovelace(ownership_ref_input.output.value)),
              )
            expect ([content_input], [content_output]) =
              (
                inputs_at_with(
                  inputs,
                  content_registry_address,
                  content_registry_ref_token,
                  ref_token.2nd,
                ),
                outputs_at_with(
                  outputs,
                  content_registry_address,
                  content_registry_ref_token,
                  ref_token.2nd,
                ),
              )
            let is_registry_updated =
              check_is_content_registry_updated(
                content_input.output.datum,
                content_output.datum,
                content_number,
                new_content_hash,
              )
            expect InlineDatum(raw_ownership_ref_datum) =
              ownership_ref_input.output.datum
            expect ownership_ref_datum: OwnershipRegistryDatum =
              raw_ownership_ref_datum
            expect Some(original_owner) =
              list.at(ownership_ref_datum.registry, content_number)
            let is_update_authorized =
              inputs_token_quantity(inputs, original_owner) > 0
            let is_registry_value_clean =
              list.length(flatten(content_output.value)) == 2
            is_registry_updated && is_update_authorized && is_registry_value_clean
          }
          StopContentRegistry ->
            when
              inputs_at_with_policy(
                inputs,
                content_registry_address,
                content_registry_ref_token,
              )
            is {
              [content_input] -> {
                let is_stop_key_signed = key_signed(extra_signatories, stop_key)
                let content_ref_token =
                  content_input.output.value |> without_lovelace
                let is_ref_token_burned = mint == negate(content_ref_token)
                is_stop_key_signed && is_ref_token_burned
              }
              _ -> False
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
