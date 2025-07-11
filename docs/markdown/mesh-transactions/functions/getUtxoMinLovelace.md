[**@meshsdk/transaction**](../README.md)

***

[@meshsdk/transaction](../globals.md) / getUtxoMinLovelace

# Function: getUtxoMinLovelace()

> **getUtxoMinLovelace**(`utxo`, `coinsPerUtxoSize`): `bigint`

Defined in: mesh-transaction/src/mesh-tx-builder/utils.ts:34

Calculate minimum lovelace required for a UTxO output

## Parameters

### utxo

`TxOutput`

Output of utxo

### coinsPerUtxoSize

`number` = `DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize`

From protocol parameters

## Returns

`bigint`

Minimum lovelace required for the UTxO
