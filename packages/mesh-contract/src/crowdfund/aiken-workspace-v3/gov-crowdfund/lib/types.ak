use cardano/address.{Address}

pub type CrowdfundRedeemer {
  RegisterCerts
  DeregisterCerts
  ContributorWithdrawal
  RemoveEmptyInstance
}

pub type CrowdfundDatum {
  completion_script: ByteArray,
  share_token: ByteArray,
  crowdfund_address: Address,
  fundraise_target: Int,
  current_fundraised_amount: Int,
  allow_over_subscription: Bool,
  deadline: Int,
  expiry_buffer: Int,
  fee_address: Address,
  min_charge: Int,
}

pub type CrowdfundGovDatum {
  Init {
    completion_script: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Proposed {
    completion_script: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Refundable {
    completion_script: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
}

pub type StakeRedeemer {
  Register
  Deregister
}
