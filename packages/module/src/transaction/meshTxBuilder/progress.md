# Progress of Lower Level API

| Method Name                             | Sync | cli | Tested | Remarks                                |
| --------------------------------------- | ---- | --- | ------ | -------------------------------------- |
| txIn                                    | X    | X   |        | Async: need chain info                 |
| txInDatumValue                          |      |     |        |                                        |
| txInInlineDatumPresent                  |      |     |        | Is this needed?                        |
| txOut                                   | X    | X   |        |                                        |
| txOutDatumHashValue                     |      |     |        |                                        |
| txOutInlineDatumValue                   | X    | X   |        |                                        |
| txOutReferenceScript                    | X    | X   |        |                                        |
| spendingPlutusScriptV2                  | X    | X   |        |                                        |
| spendingTxInReference                   | X    | X   |        | Async: need chain info                 |
| spendingReferenceTxInInlineDatumPresent | X    | X   |        | Identical with txInInlineDatumPresent? |
| spendingReferenceTxInRedeemerValue      | X    | X   |        |                                        |
| readOnlyTxInReference                   | X    | X   |        | How is this used?                      |
| mintPlutusScriptV2                      | X    | X   |        |                                        |
| mint                                    | X    | X   |        |                                        |
| mintTxInReference                       | X    | X   |        |                                        |
| mintReferenceTxInRedeemerValue          | X    | X   |        |                                        |
| policyId                                |      |     |        | Is this needed?                        |
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
