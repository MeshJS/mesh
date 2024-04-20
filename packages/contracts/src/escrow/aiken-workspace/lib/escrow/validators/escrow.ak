use aiken/transaction.{
  InlineDatum, Input, ScriptContext, Spend, Transaction, find_input,
}
use aiken/transaction/value.{merge}
use escrow/types.{
  ActiveEscrow, CancelTrade, CompleteTrade, EscrowDatum, EscrowRedeemer,
  Initiation, RecipientDeposit,
}
use sidan_utils/address.{address_pub_key}
use sidan_utils/extra_signatories.{
  all_key_signed, key_signed, one_of_keys_signed,
}
use sidan_utils/inputs.{inputs_at}
use sidan_utils/outputs.{outputs_at}
use sidan_utils/value.{get_all_value_to, value_geq} as sidan_value

pub fn escrow_logic(
  _datum: EscrowDatum,
  redeemer: EscrowRedeemer,
  ctx: ScriptContext,
) {
  when ctx.purpose is {
    Spend(utxo) -> {
      let Transaction { inputs, outputs, extra_signatories, .. } =
        ctx.transaction
      expect Some(own_input) = find_input(inputs, utxo)
      let own_address = own_input.output.address
      when redeemer is {
        RecipientDeposit { recipient, recipient_assets } -> {
          expect ([input], [output]) =
            (inputs_at(inputs, own_address), outputs_at(outputs, own_address))
          // Only 1 input & output from same address
          expect InlineDatum(raw_input_datum) = input.output.datum
          expect InlineDatum(raw_output_datum) = output.datum
          expect Initiation { initiator, initiator_assets }: EscrowDatum =
            raw_input_datum
          expect output_datum: EscrowDatum = raw_output_datum
          let is_datum_updated =
            output_datum == ActiveEscrow {
              initiator,
              recipient,
              initiator_assets,
              recipient_assets,
            }
          let is_value_deposited =
            value_geq(
              output.value,
              input.output.value |> merge(recipient_assets),
            )
          is_datum_updated && is_value_deposited
        }
        CancelTrade -> {
          expect ([input], []) =
            (inputs_at(inputs, own_address), outputs_at(outputs, own_address))
          expect InlineDatum(raw_input_datum) = input.output.datum
          expect input_datum: EscrowDatum = raw_input_datum
          when input_datum is {
            Initiation { initiator, .. } ->
              key_signed(extra_signatories, address_pub_key(initiator))
            ActiveEscrow {
              initiator,
              recipient,
              initiator_assets,
              recipient_assets,
            } -> {
              let initiator_received = get_all_value_to(outputs, initiator)
              let recipient_received = get_all_value_to(outputs, recipient)
              let is_initiator_received_value =
                value_geq(initiator_received, initiator_assets)
              let is_recipient_received_value =
                value_geq(recipient_received, recipient_assets)
              let is_any_party_signed =
                one_of_keys_signed(
                  extra_signatories,
                  [address_pub_key(initiator), address_pub_key(recipient)],
                )
              is_any_party_signed && is_initiator_received_value && is_recipient_received_value
            }
          }
        }
        CompleteTrade -> {
          expect ([input], []) =
            (inputs_at(inputs, own_address), outputs_at(outputs, own_address))
          expect InlineDatum(raw_input_datum) = input.output.datum
          expect ActiveEscrow {
            initiator,
            recipient,
            initiator_assets,
            recipient_assets,
          }: EscrowDatum = raw_input_datum
          let initiator_received = get_all_value_to(outputs, initiator)
          let recipient_received = get_all_value_to(outputs, recipient)
          let is_initiator_received_value =
            value_geq(initiator_received, recipient_assets)
          let is_recipient_received_value =
            value_geq(recipient_received, initiator_assets)
          let is_both_parties_signed =
            all_key_signed(
              extra_signatories,
              [address_pub_key(initiator), address_pub_key(recipient)],
            )
          is_both_parties_signed && is_initiator_received_value && is_recipient_received_value
        }
      }
    }

    _ -> False
  }
}
