pub type CrowdfundRedeemer {
  RegisterCerts
  DeregisterCerts
  ContributorWithdrawal
  RemoveEmptyInstance
}

pub type CrowdfundDatum {
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
