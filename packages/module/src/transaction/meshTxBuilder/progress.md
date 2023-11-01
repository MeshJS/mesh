# Progress of Lower Level API

| Method Name                             | Sync | cli | Tested | Remarks                                |
| --------------------------------------- | ---- | --- | ------ | -------------------------------------- |
| txIn                                    | X    |     |        | Async: need chain info                 |
| txInDatumValue                          |      |     |        |                                        |
| txInInlineDatumPresent                  | X    |     |        |                                        |
| txOut                                   | X    | X   |        |                                        |
| txOutDatumHashValue                     |      |     |        |                                        |
| txOutInlineDatumValue                   | X    | X   |        |                                        |
| txOutReferenceScript                    | X    | X   |        |                                        |
| spendingPlutusScriptV2                  | X    | X   |        |                                        |
| spendingTxInReference                   | X    |     |        | Async: need chain info                 |
| spendingReferenceTxInInlineDatumPresent | X    |     |        | Identical with txInInlineDatumPresent? |
| spendingReferenceTxInRedeemerValue      | X    |     |        |                                        |
| readOnlyTxInReference                   |      |     |        |                                        |
| mintPlutusScriptV2                      | X    | X   |        |                                        |
| mint                                    | X    | X   |        |                                        |
| mintTxInReference                       | X    | X   |        |                                        |
| mintReferenceTxInRedeemerValue          | X    | X   |        |                                        |
| policyId                                |      |     |        |                                        |
| requiredSignerHash                      | X    | X   |        |                                        |
| txInCollateral                          |      |     |        |                                        |
| changeAddress                           | X    | X   |        |                                        |
| invalidBefore                           | X    | X   |        |                                        |
| invalidHereafter                        | X    | X   |        |                                        |
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
