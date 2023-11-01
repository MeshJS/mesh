# Progress of Lower Level API

| Method Name                             | Completed | Tested | Remarks                                     |
| --------------------------------------- | --------- | ------ | ------------------------------------------- |
| \_txIn                                  | X         |        | Accepts address and amount as param as well |
| txIn                                    |           |        | Async: need chain info                      |
| txInDatumValue                          |           |        |                                             |
| txInInlineDatumPresent                  | X         |        |                                             |
| txOut                                   | X         |        |                                             |
| txOutDatumHashValue                     |           |        |                                             |
| txOutInlineDatumValue                   | X         |        |                                             |
| txOutReferenceScript                    | X         |        |                                             |
| spendingPlutusScriptV2                  | X         |        |                                             |
| \_spendingTxInReference                 | X         |        | Accepts scriptHash as well                  |
| spendingTxInReference                   |           |        | Async: need chain info                      |
| spendingReferenceTxInInlineDatumPresent | X         |        | Identical with txInInlineDatumPresent?      |
| spendingReferenceTxInRedeemerValue      |           |        |                                             |
| readOnlyTxInReference                   |           |        |                                             |
| mintPlutusScriptV2                      |           |        |                                             |
| mint                                    |           |        |                                             |
| mintTxInReference                       |           |        |                                             |
| mintReferenceTxInRedeemerValue          |           |        |                                             |
| policyId                                |           |        |                                             |
| requiredSignerHash                      | X         |        |                                             |
| txInCollateral                          |           |        |                                             |
| changeAddress                           | X         |        |                                             |
| invalidBefore                           | X         |        |                                             |
| invalidHereafter                        | X         |        |                                             |
| complete                                |           |        |                                             |
| getUTxOInfo                             |           |        |                                             |
| mainnet                                 |           |        |                                             |
| testnetMagic                            |           |        |                                             |
| byronEra                                |           |        |                                             |
| shelleyEra                              |           |        |                                             |
| allegraEra                              |           |        |                                             |
| maryEra                                 |           |        |                                             |
| alonzoEra                               |           |        |                                             |
| babbageEra                              |           |        |                                             |
| protocolParams                          |           |        |                                             |
