use aiken/collection/list
// Issuance CBOR Hex Reference NFT Minting Policy
// Simple one-shot minting policy to create a reference NFT that marks the UTxO
// containing the issuance script template bytes (prefix and postfix)
// Migrated from SmartTokens.Contracts.IssuanceCborHex

use cardano/assets.{PolicyId, flatten}
use cardano/transaction.{OutputReference, Transaction}
use types.{issuance_cbor_hex_token_name}

validator issuance_cbor_hex_mint(utxo_ref: OutputReference) {
  mint(_redeemer: Data, own_policy: PolicyId, self: Transaction) {
    trace @"Starting issuance_cbor_hex_mint validation"
    // Must consume the one-shot UTxO
    let consumed =
      list.any(self.inputs, fn(input) { input.output_reference == utxo_ref })

    // Get all minted tokens from this policy
    let minted_tokens = flatten(self.mint)
    let own_minted =
      list.filter(
        minted_tokens,
        fn(token) {
          let (cs, _tn, _qty) = token
          cs == own_policy
        },
      )

    // Must mint exactly one token with the correct name and quantity
    expect [(_, tn, qty)] = own_minted

    and {
      // One-shot: the specified UTxO must be consumed
      consumed?,
      // Token name must be "IssuanceCborHex"
      (tn == issuance_cbor_hex_token_name)?,
      // Exactly 1 token minted
      (qty == 1)?,
    }
  }

  else(_) {
    fail
  }
}
