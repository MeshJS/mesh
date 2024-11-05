## User Actions

This documentation would outline a more detailed transaction specification on user actions, which involve more than 1 script actions / or capacity testing is needed to estimate the scalability.

1. Create Content:

   - Validation: 4.1, 6.1
   - Transaction body

   ```js
   - inputs: [ownership_registry_input, content_registry_input],
   - reference_inputs: [oracle_ref_utxo],
   - outputs: [ownership_registry_output, content_registry_output],
   - extra_signatories: List<Hash<Blake2b_224, VerificationKey>>,
   - redeemers: {
    Spend(ownership_registry_input_utxo): CreateOwnershipRecord,
    Spend(content_registry_input_utxo): CreateContent { content_hash: ByteArray, owner: (PolicyId, AssetName) }
   }
   ```

2. Update Content:

   - Validation: 4.2
   - Transaction body (reference to frontend demo repo)

3. Transfer Content:

   - Validation: 6.2
   - Transaction body (reference to frontend demo repo)
