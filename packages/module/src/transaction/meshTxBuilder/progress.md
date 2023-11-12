# Progress of Lower Level API

| Method Name                             | Sync | cli | Tested | Remarks                               |
| --------------------------------------- | ---- | --- | ------ | ------------------------------------- |
| txIn                                    | X    | X   | X      |                                       |
| txInDatumValue                          |      |     |        |                                       |
| txInInlineDatumPresent                  | X    | X   | X      |                                       |
| txOut                                   | X    | X   | X      |                                       |
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
| policyId                                |      |     |        | Is this needed?                       |
| requiredSignerHash                      | X    | X   | X      |                                       |
| txInCollateral                          |      |     |        |                                       |
| changeAddress                           | X    | X   | X      |                                       |
| invalidBefore                           | X    | X   |        |                                       |
| invalidHereafter                        | X    | X   |        |                                       |
| metadataValue                           | X    | X   | X      |                                       |
| signingKey                              | X    | X   | X      |                                       |
| complete                                |      |     |        |                                       |
| getUTxOInfo                             | X    | X   | X      |                                       |
| protocolParams                          |      |     |        |                                       |
| txOutMinUtxo                            |      |     |        |                                       |
