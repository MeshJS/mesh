use cardano/address.{from_script}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{Transaction}
use cocktail.{inputs_at}
use types.{
  CrowdfundRedeemer, Deregister, DeregisterCerts, Register, RegisterCerts,
  StakeRedeemer,
}
use utils.{redeemer_with_input}

validator stake(spend_script_hash: ByteArray) {
  else(ctx: ScriptContext) {
    let ScriptContext { transaction, redeemer, .. } = ctx
    expect stake_redeemer: StakeRedeemer = redeemer
    let Transaction { inputs, redeemers, .. } = transaction
    let spend_address = from_script(spend_script_hash)
    expect [only_input] = inputs_at(inputs, spend_address)
    expect Some(only_inpuy_redeemer_data) =
      redeemer_with_input(redeemers, only_input)

    expect only_input_redeemer: CrowdfundRedeemer = only_inpuy_redeemer_data

    when stake_redeemer is {
      Register -> {
        let redeemer_check = only_input_redeemer == RegisterCerts

        redeemer_check?
      }
      Deregister -> {
        let redeemer_check = only_input_redeemer == DeregisterCerts

        redeemer_check?
      }
    }
  }
}
