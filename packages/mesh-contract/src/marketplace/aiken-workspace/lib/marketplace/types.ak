use aiken/transaction/credential.{Address}

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
