use aiken/transaction.{ScriptContext}
use aiken/transaction/value.{AssetName, PolicyId}
use aiken_virtual_dex/types.{VirtualDexDatum, VirtualDexRedeemer}
use aiken_virtual_dex/validators/virtual_dex.{virtual_dex_logic}

validator(
  oracle_nft: PolicyId,
  emergency_token: PolicyId,
  param_long_token: (PolicyId, AssetName),
  param_short_token: (PolicyId, AssetName),
) {
  fn vesting_validator(
    datum: VirtualDexDatum,
    redeemer: VirtualDexRedeemer,
    context: ScriptContext,
  ) {
    vesting_validator_logic(
      oracle_nft,
      emergency_token,
      param_long_token,
      param_short_token,
      datum,
      redeemer,
      context,
    )
  }
}
