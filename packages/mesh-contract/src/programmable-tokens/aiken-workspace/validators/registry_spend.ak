use aiken/collection/list
// Registry spending validator - allows spending registry node UTxOs
// Migrated from SmartTokens.LinkedList.SpendDirectory (pmkDirectorySpending)
//
// This validator locks all registry node UTxOs. It allows spending them
// only when registry node NFTs are being minted, which ensures that
// the registry structure is being properly maintained.

use cardano/assets.{PolicyId, flatten}
use cardano/transaction.{Transaction}
use types.{ProgrammableLogicGlobalParams}
use utils.{expect_inline_datum, has_currency_symbol}

validator registry_spend(protocol_params_cs: PolicyId) {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: Data,
    self: Transaction,
  ) {
    trace @"Starting registry_spend validation"

    // Find the protocol params UTxO in reference inputs
    // This contains the registry_node_cs we need to validate against
    expect Some(params_ref_input) =
      list.find(
        self.reference_inputs,
        fn(input) {
          has_currency_symbol(input.output.value, protocol_params_cs)
        },
      )

    // Extract the protocol params datum
    let params_datum = expect_inline_datum(params_ref_input.output)
    expect params: ProgrammableLogicGlobalParams = params_datum

    let registry_node_cs = params.registry_node_cs

    // Check that registry node NFTs are being minted or burned in this transaction
    // This ensures we're modifying the registry structure (inserting/removing nodes)
    let minting_registry_nodes =
      list.any(
        flatten(self.mint),
        fn(asset) {
          let (policy, _tn, amt) = asset
          policy == registry_node_cs && amt != 0
        },
      )

    // Validation passes if registry NFTs are being minted/burned
    minting_registry_nodes?
  }

  else(_) {
    fail
  }
}
