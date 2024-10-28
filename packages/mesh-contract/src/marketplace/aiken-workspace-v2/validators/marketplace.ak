use cardano/address.{Address}
use cardano/assets.{from_lovelace, lovelace_of}
use cardano/transaction.{OutputReference, Transaction, find_input}
use vodka_address.{address_pub_key}
use vodka_extra_signatories.{key_signed}
use vodka_inputs.{inputs_at}
use vodka_value.{get_all_value_to, value_geq}

pub type MarketplaceDatum {
  MarketplaceDatum {
    seller: Address,
    price: Int,
    policy: ByteArray,
    tokenName: ByteArray,
  }
}

pub type MarketplaceRedeemer {
  Buy
  Close
}

validator marketplace(owner: Address, fee_percentage_basis_point: Int) {
  spend(
    datum_opt: Option<MarketplaceDatum>,
    redeemer: MarketplaceRedeemer,
    input: OutputReference,
    tx: Transaction,
  ) {
    expect Some(datum) = datum_opt
    when redeemer is {
      Buy -> {
        expect Some(own_input) = find_input(tx.inputs, input)
        let own_address = own_input.output.address
        let is_only_one_input_from_script =
          when inputs_at(tx.inputs, own_address) is {
            [_] -> True
            _ -> False
          }

        let is_proceed_paid =
          get_all_value_to(tx.outputs, datum.seller)
            |> value_geq(
                from_lovelace(datum.price + lovelace_of(own_input.output.value)),
              )
        let is_fee_paid =
          get_all_value_to(tx.outputs, owner)
            |> value_geq(
                from_lovelace(datum.price * fee_percentage_basis_point / 10000),
              )
        is_only_one_input_from_script && is_fee_paid && is_proceed_paid
      }
      Close -> {
        expect Some(pub_key) = address_pub_key(datum.seller)
        key_signed(tx.extra_signatories, pub_key)
      }
    }
  }

  else(_) {
    fail
  }
}
