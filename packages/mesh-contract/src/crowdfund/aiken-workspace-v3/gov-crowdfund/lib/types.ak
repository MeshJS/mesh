use cardano/address.{Address}
use cardano/governance.{GovernanceActionId}

pub type CrowdfundRedeemer {
  RegisterCerts
  DeregisterCerts
  VoteOnGovAction
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
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Proposed {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Voted {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    gov_tx_id: GovernanceActionId,
    deadline: Int,
  }
  Refundable {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
}

pub type MintPolarity {
  RMint
  RBurn
}

pub type PublishRedeemer {
  Register
  Deregister
}
