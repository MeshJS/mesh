use cardano/address.{Address}

pub type MintPolarity {
  RMint
  RBurn
}

pub type CrowdfundRedeemer {
  ContributeFund
  CompleteCrowdfund
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
