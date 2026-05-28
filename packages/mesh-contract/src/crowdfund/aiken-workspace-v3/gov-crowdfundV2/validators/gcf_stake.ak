use cardano/address.{from_script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}
use cocktail.{inputs_at}
use types.{
  CrowdfundGovRedeemer, Deregister, DeregisterCerts, PublishRedeemer, Register,
  RegisterCerts, VoteOnGovAction,
}
use utils.{check_spend_script_input_redeemer, redeemer_with_input}

// Stake validator coordinating governance operations and token lifecycle
validator gCf_stake(
  _auth_token: PolicyId,
  spend: ByteArray,
  _gov_action_period: Int,
) {
  // Publish: Validate certificate registration/deregistration coordination
  publish(redeemer: PublishRedeemer, _c, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    let spend_address = from_script(spend)
    expect [only_input] = inputs_at(inputs, spend_address)
    expect Some(only_inpuy_redeemer_data) =
      redeemer_with_input(redeemers, only_input)

    expect only_input_redeemer: CrowdfundGovRedeemer = only_inpuy_redeemer_data

    when redeemer is {
      // Register: Validate spend validator is registering certificates
      Register -> {
        let redeemer_check = only_input_redeemer == RegisterCerts

        redeemer_check?
      }
      // Deregister: Validate spend validator is deregistering certificates
      Deregister -> {
        let redeemer_check = only_input_redeemer == DeregisterCerts

        redeemer_check?
      }
    }
  }

  // Propose: Validate governance proposal submission coordination
  propose(_r, _p, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    check_spend_script_input_redeemer(spend, inputs, redeemers, RegisterCerts)?
  }

  // Vote: Validate governance vote coordination
  vote(_r, _v, self: Transaction) {
    let Transaction { inputs, redeemers, .. } = self
    check_spend_script_input_redeemer(spend, inputs, redeemers, VoteOnGovAction)?
  }

  else(_) {
    fail
  }
}
