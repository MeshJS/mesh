## Specification of Smart Contracts

1.  One Time Minting Policy

    - Serve as reference token living on oracle validator
    - Param: Input UTxO
    - Validation rules:
      1. Minting rule: Param input is spent
      2. Burning rule: Only negative amount exists regarding this policy

2.  Oracle Validator

    - Locking the oracle token with information for the Dapp
    - Validation rules:
      1. Create new content registry: The content registry reference token is minted (with correct name)
      2. Create new ownership registry: The ownership registry reference token is minted (with correct name)
      3. Rotate key: Transaction is signed by both operating key and stop key
         - Redeemer info: new operation key and key stop key
      4. Stop app: Oracle token is burned with signature from stop key

3.  Content Registry Reference Token

    - The minting policy of the reference token locked in content registry validator
    - Param: oracle token policy
    - Validation rules:
      1. Minting rule: oracle_datum_updated && registry_initial_datum_correct && oracle_output_value_clean && registry_output_value_clean
      2. Burning rule: Only negative amount exists regarding this policy

4.  Content Registry Validator

    - Param: oracle token policy
    - Validation rules:
      1. Create content
         - Redeemer info: `content_hash` and `owner` token
         - ref_tokens_equal && current_count_equal && content_new_datum_correct && ownership_new_datum_correct && content_registry_value_clean && ownership_registry_value_clean
      2. Update content
         - Redeemer: `new_content_hash` and `content_number` in the registry
         - is_registry_updated && is_update_authorized && is_registry_value_clean
      3. Stop content registry
         - Content registry reference is burn
         - Signed by stop key

5.  Ownership Registry Reference Token

    - The minting policy of the reference token locked in ownership registry validator
    - Param: oracle token policy
    - Validation rules:
      1. Minting rule: oracle_datum_updated && registry_initial_datum_correct && oracle_output_value_clean && registry_output_value_clean
      2. Burning rule: Only negative amount exists regarding this policy

6.  Ownership Registry Validator

    - Param: oracle token policy
    - Validation rules:
      1. Create ownership record: Content ownership input is also validating with create content redeemer
      2. Transfer ownership
         - Redeemer: `new_owner_token` and `content_number` in the registry
         - is_original_owner_authorized && is_registry_updated && is_registry_value_clean
      3. Stop ownership registry
         - Ownership registry reference is burn
         - Signed by stop key
