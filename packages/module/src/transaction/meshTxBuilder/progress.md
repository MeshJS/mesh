# Progress of Lower Level API - MeshTxBuilder

## Core Apis

| Method Name                             | Sync | cli | Tested | Remarks                               |
| --------------------------------------- | ---- | --- | ------ | ------------------------------------- |
| txIn                                    | X    | X   | X      |                                       |
| txInDatumValue                          |      |     |        |                                       |
| txInInlineDatumPresent                  | X    | X   | X      |                                       |
| txOut                                   | X    | X   | X      | automate minUTxO not tested           |
| txOutDatumHashValue                     |      |     |        |                                       |
| txOutInlineDatumValue                   | X    | X   | X      |                                       |
| txOutReferenceScript                    | X    | X   |        |                                       |
| spendingPlutusScriptV2                  | X    | X   | X      |                                       |
| spendingTxInReference                   | X    | X   | X      |                                       |
| spendingReferenceTxInInlineDatumPresent | X    | X   | X      | Identical with txInInlineDatumPresent |
| spendingReferenceTxInRedeemerValue      | X    | X   | X      |                                       |
| readOnlyTxInReference                   | X    | X   | X      |                                       |
| mintPlutusScriptV2                      | X    | X   | X      |                                       |
| mint                                    | X    | X   | X      |                                       |
| mintTxInReference                       | X    | X   | X      |                                       |
| mintRedeemerValue                       | X    | X   | X      |                                       |
| mintReferenceTxInRedeemerValue          | X    | X   | X      |                                       |
| requiredSignerHash                      | X    | X   | X      |                                       |
| txInCollateral                          | X    | X   | X      |                                       |
| changeAddress                           | X    | X   | X      | Collateral return is not tested       |
| invalidBefore                           | X    | X   |        |                                       |
| invalidHereafter                        | X    | X   |        |                                       |
| metadataValue                           | X    | X   | X      |                                       |
| signingKey                              | X    | X   | X      |                                       |
| complete                                |      |     |        | TODO: EvaluateTx / Collateral returns |
| getUTxOInfo                             | X    | X   | X      |                                       |
| protocolParams                          | X    | X   | X      |                                       |

## Other Tasks

- Add collateral return
- Completing Apis
  - Staking related apis

## Higher Level refactor plan

- UTxO selection
- Expose the `txBuilder`
- Migrating to lower level apis if any
- Removing redundant operations (make it using MeshTxBuilderCore's methods)
