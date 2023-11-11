# Progress of Lower Level API

| Method Name                             | Sync | cli | Tested | Remarks                                |
| --------------------------------------- | ---- | --- | ------ | -------------------------------------- |
| txIn                                    | X    | X   | X      | Async: need chain info                 |
| txInDatumValue                          |      |     |        |                                        |
| txInInlineDatumPresent                  |      |     |        | Is this needed?                        |
| txOut                                   | X    | X   | X      |                                        |
| txOutDatumHashValue                     |      |     |        |                                        |
| txOutInlineDatumValue                   | X    | X   |        |                                        |
| txOutReferenceScript                    | X    | X   |        |                                        |
| spendingPlutusScriptV2                  | X    | X   |        |                                        |
| spendingTxInReference                   | X    | X   |        | Script hash has to be provided         |
| spendingReferenceTxInInlineDatumPresent | X    | X   |        | Identical with txInInlineDatumPresent? |
| spendingReferenceTxInRedeemerValue      | X    | X   |        |                                        |
| readOnlyTxInReference                   | X    | X   |        |                                        |
| mintPlutusScriptV2                      | X    | X   |        |                                        |
| mint                                    | X    | X   |        |                                        |
| mintTxInReference                       | X    | X   |        |                                        |
| mintReferenceTxInRedeemerValue          | X    | X   |        |                                        |
| policyId                                |      |     |        | Is this needed?                        |
| requiredSignerHash                      | X    | X   |        |                                        |
| txInCollateral                          |      |     |        |                                        |
| changeAddress                           | X    | X   | X      |                                        |
| invalidBefore                           | X    | X   |        |                                        |
| invalidHereafter                        | X    | X   |        |                                        |
| metadataValue                           | X    | X   |        |                                        |
| signingKey                              | X    | X   | X      |                                        |
| complete                                |      |     |        |                                        |
| getUTxOInfo                             | X    | X   | X      |                                        |
| mainnet                                 |      |     |        |                                        |
| testnetMagic                            |      |     |        |                                        |
| byronEra                                |      |     |        |                                        |
| shelleyEra                              |      |     |        |                                        |
| allegraEra                              |      |     |        |                                        |
| maryEra                                 |      |     |        |                                        |
| alonzoEra                               |      |     |        |                                        |
| babbageEra                              |      |     |        |                                        |
| protocolParams                          |      |     |        |                                        |
| txOutMinUtxo                            |      |     |        |                                        |
