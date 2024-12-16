import { Asset, UTxO } from "@meshsdk/core";
import { csl } from "@meshsdk/core-csl";

export async function commitUtxo(utxo: UTxO) {
  const txBuilder = csl.TransactionBuilder.new(
    csl.TransactionBuilderConfigBuilder.new()
      .fee_algo(csl.LinearFee.new(csl.BigNum.zero(), csl.BigNum.zero()))
      .pool_deposit(csl.BigNum.from_str("500000000"))
      .key_deposit(csl.BigNum.from_str("2000000"))
      .max_value_size(5000)
      .max_tx_size(16384)
      .coins_per_utxo_byte(csl.BigNum.zero())
      .ex_unit_prices(
        csl.ExUnitPrices.new(
          csl.UnitInterval.new(csl.BigNum.zero(), csl.BigNum.one()),
          csl.UnitInterval.new(csl.BigNum.zero(), csl.BigNum.one()),
        ),
      )
      .ref_script_coins_per_byte(
        csl.UnitInterval.new(csl.BigNum.zero(), csl.BigNum.one()),
      )
      .deduplicate_explicit_ref_inputs_with_regular_inputs(true)
      .build(),
  );
}
