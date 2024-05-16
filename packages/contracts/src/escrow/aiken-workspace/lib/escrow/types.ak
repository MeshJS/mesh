use aiken/transaction/credential.{Address}
use aiken/transaction/value.{Value}

pub type EscrowDatum {
  Initiation { initiator: Address, initiator_assets: Value }
  ActiveEscrow {
    initiator: Address,
    initiator_assets: Value,
    recipient: Address,
    recipient_assets: Value,
  }
}

pub type EscrowRedeemer {
  RecipientDeposit { recipient: Address, recipient_assets: Value }
  CancelTrade
  CompleteTrade
}
