# Progress of Lower Level API

| Method Name                             | Sync | cli | Tested | Remarks                                |
| --------------------------------------- | ---- | --- | ------ | -------------------------------------- |
| txIn                                    | X    |     |        | Async: need chain info                 |
| txInDatumValue                          |      |     |        |                                        |
| txInInlineDatumPresent                  | X    |     |        |                                        |
| txOut                                   | X    |     |        |                                        |
| txOutDatumHashValue                     |      |     |        |                                        |
| txOutInlineDatumValue                   | X    |     |        |                                        |
| txOutReferenceScript                    | X    |     |        |                                        |
| spendingPlutusScriptV2                  | X    |     |        |                                        |
| spendingTxInReference                   | X    |     |        | Async: need chain info                 |
| spendingReferenceTxInInlineDatumPresent | X    |     |        | Identical with txInInlineDatumPresent? |
| spendingReferenceTxInRedeemerValue      | X    |     |        |                                        |
| readOnlyTxInReference                   |      |     |        |                                        |
| mintPlutusScriptV2                      | X    |     |        |                                        |
| mint                                    | X    |     |        |                                        |
| mintTxInReference                       | X    |     |        |                                        |
| mintReferenceTxInRedeemerValue          | X    |     |        |                                        |
| policyId                                |      |     |        |                                        |
| requiredSignerHash                      | X    |     |        |                                        |
| txInCollateral                          |      |     |        |                                        |
| changeAddress                           | X    |     |        |                                        |
| invalidBefore                           | X    |     |        |                                        |
| invalidHereafter                        | X    |     |        |                                        |
| complete                                |      |     |        |                                        |
| getUTxOInfo                             |      |     |        |                                        |
| mainnet                                 |      |     |        |                                        |
| testnetMagic                            |      |     |        |                                        |
| byronEra                                |      |     |        |                                        |
| shelleyEra                              |      |     |        |                                        |
| allegraEra                              |      |     |        |                                        |
| maryEra                                 |      |     |        |                                        |
| alonzoEra                               |      |     |        |                                        |
| babbageEra                              |      |     |        |                                        |
| protocolParams                          |      |     |        |                                        |
