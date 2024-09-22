# Demo on content ownership

## Before Start

1. Prepare the env as the [`.env.example`](.env.example)

   - Prepare the API needed keys
     - NEXT_PUBLIC_INFURA_PROJECT_ID
     - NEXT_PUBLIC_INFURA_PROJECT_SECRET
     - NEXT_PUBLIC_MAESTRO_APIKEY
   - Prepare the admin wallet
     - NEXT_PUBLIC_SKEY (the skey generated from `cardano-cli`)
     - NEXT_PUBLIC_WALLET_ADDRESS (the derived wallet from the signing key)
     - NEXT_PUBLIC_REF_SCRIPTS_ADDR (the address where you would never touch, to store the reference script)

2. Setup the application
   1. To mint the Oracle NFT
   2. Configure the Policy to `NEXT_PUBLIC_ORACLE_NFT_POLICY_ID` env.
   3. Sending reference script of all script except oracle NFT, and set the env of below, all in format of `TXHASH#TXID`:
      - NEXT_PUBLIC_ORACLE_VALIDATOR_REF_UTXO
      - NEXT_PUBLIC_CONTENT_TOKEN_REF_UTXO
      - NEXT_PUBLIC_OWNERSHIP_TOKEN_REF_UTXO
      - NEXT_PUBLIC_CONTENT_REGISTRY_REF_UTXO
      - NEXT_PUBLIC_OWNERSHIP_REGISTRY_REF_UTXO
   4. Set up the oracle validator
   5. Create `ContentRegistry` and `OwnershipRegistry` to the scale needed (1 pair at a time)

## Using the application

Users can interact with the content ownership scripts with 3 major actions:

1. Creating content
2. Transfer content
3. Update content

## Admin action

If the application is no longer in used, it could be stopped by admin actions for unlocking minUTxO with the registries:

1. Stop content registry
2. Stop ownership registry
3. Stop app oracle (DANGER: After this is triggered, registries could not be stopped anymore and there would be permanently locked ADA)

## API testing

All script actions could be testing in `/admin`
