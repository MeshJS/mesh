import { csl } from '../../core';
import { buildPlutusData } from './builder';
import { POLICY_ID_LENGTH, REDEEMER_TAGS } from '../constants';
import {
  deserializeDataHash, deserializePlutusData, deserializeScriptHash,
  deserializeScriptRef, deserializeTxHash,
} from './deserializer';
import type {
  PlutusData, Redeemer, TransactionUnspentOutput, Value,
} from '../../core';
import type { Action, Asset, Data, UTxO } from '../types';

/* -----------------[ ASCII ]----------------- */

export const toASCII = (hex: string) => Buffer.from(hex, 'hex').toString('ascii');

/* -----------------[ Address ]----------------- */

export const toAddress = (bech32: string) => csl.Address.from_bech32(bech32);

export const toBaseAddress = (bech32: string) => csl.BaseAddress.from_address(toAddress(bech32));

export const toEnterpriseAddress = (bech32: string) => csl.EnterpriseAddress.from_address(toAddress(bech32));

/* -----------------[ Bytes ]----------------- */

export const fromBytes = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

export const toBytes = (hex: string) => Buffer.from(hex, 'hex') as Uint8Array;

/* -----------------[ Lovelace ]----------------- */

export const fromLovelace = (lovelace: number) => lovelace / 1_000_000;

export const toLovelace = (ada: number) => ada * 1_000_000;

/* -----------------[ PlutusData ]----------------- */

export const toPlutusData = (data: Data, alternative = 0): PlutusData => {
  const fields = csl.PlutusList.new();

  data.fields.forEach((field) => {
    fields.add(buildPlutusData(field));
  });

  return csl.PlutusData.new_constr_plutus_data(
    csl.ConstrPlutusData.new(
      csl.BigNum.from_str(alternative.toString()), fields
    ),
  );
};

/* -----------------[ Redeemer ]----------------- */

export const toRedeemer = (action: Action): Redeemer => {
  const lookupRedeemerTag = (key: string) => REDEEMER_TAGS[key];

  return csl.Redeemer.new(
    lookupRedeemerTag(action.tag),
    csl.BigNum.from_str(action.index.toString()),
    toPlutusData(action.data, action.alternative),
    csl.ExUnits.new(
      csl.BigNum.from_str(action.budget.mem.toString()),
      csl.BigNum.from_str(action.budget.steps.toString())
    )
  );
}

/* -----------------[ TransactionUnspentOutput ]----------------- */

export const fromTxUnspentOutput = (
  txUnspentOutput: TransactionUnspentOutput
): UTxO => {
  const dataHash = txUnspentOutput.output().has_data_hash()
    ? fromBytes(txUnspentOutput.output().data_hash()?.to_bytes()!)
    : undefined;

  const plutusData = txUnspentOutput.output().has_plutus_data()
    ? fromBytes(txUnspentOutput.output().plutus_data()?.to_bytes()!)
    : undefined;

  const scriptRef = txUnspentOutput.output().has_script_ref()
    ? fromBytes(txUnspentOutput.output().script_ref()?.to_bytes()!)
    : undefined;

  return {
    input: {
      outputIndex: txUnspentOutput.input().index(),
      txHash: fromBytes(txUnspentOutput.input().transaction_id().to_bytes()),
    },
    output: {
      address: txUnspentOutput.output().address().to_bech32(),
      amount: fromValue(txUnspentOutput.output().amount()),
      dataHash, plutusData, scriptRef,
    },
  };
};

export const toTxUnspentOutput = (utxo: UTxO) => {
  const txInput = csl.TransactionInput.new(
    deserializeTxHash(utxo.input.txHash),
    utxo.input.outputIndex
  );

  const txOutput = csl.TransactionOutput.new(
    toAddress(utxo.output.address),
    toValue(utxo.output.amount)
  );

  if (utxo.output.dataHash !== undefined) {
    txOutput.set_data_hash(deserializeDataHash(utxo.output.dataHash));
  }

  if (utxo.output.plutusData !== undefined) {
    txOutput.set_plutus_data(deserializePlutusData(utxo.output.plutusData));
  }

  if (utxo.output.scriptRef !== undefined) {
    txOutput.set_script_ref(deserializeScriptRef(utxo.output.scriptRef));
  }

  return csl.TransactionUnspentOutput.new(txInput, txOutput);
};

/* -----------------[ UnitInterval ]----------------- */

export const toUnitInterval = (float: string) => {
  const decimal = float.split('.')[1];

  const numerator = `${parseInt(decimal, 10)}`;
  const denominator = '1' + '0'.repeat(decimal.length);

  return csl.UnitInterval.new(
    csl.BigNum.from_str(numerator),
    csl.BigNum.from_str(denominator)
  );
};

/* -----------------[ Value ]----------------- */

export const fromValue = (value: Value) => {
  const assets: Asset[] = [
    { unit: 'lovelace', quantity: value.coin().to_str() },
  ];

  const multiasset = value.multiasset();
  if (multiasset !== undefined) {
    const policies = multiasset.keys();
    for (let i = 0; i < policies.len(); i += 1) {
      const policyId = policies.get(i);
      const policyAssets = multiasset.get(policyId);
      if (policyAssets !== undefined) {
        const policyAssetNames = policyAssets.keys();
        for (let j = 0; j < policyAssetNames.len(); j += 1) {
          const assetName = policyAssetNames.get(j);
          const quantity = policyAssets.get(assetName) ?? csl.BigNum.from_str('0');
          const assetId = fromBytes(policyId.to_bytes()) + fromBytes(assetName.name());
          assets.push({ unit: assetId, quantity: quantity.to_str() });
        }
      }
    }
  }

  return assets;
};

export const toValue = (assets: Asset[]) => {
  const lovelace = assets.find((asset) => asset.unit === 'lovelace');
  const policies = Array.from(
    new Set<string>(
      assets
        .filter((asset) => asset.unit !== 'lovelace')
        .map((asset) => asset.unit.slice(0, POLICY_ID_LENGTH))
    )
  );

  const multiAsset = csl.MultiAsset.new();
  policies.forEach((policyId) => {
    const policyAssets = csl.Assets.new();
    assets
      .filter((asset) => asset.unit.slice(0, POLICY_ID_LENGTH) === policyId)
      .forEach((asset) => {
        policyAssets.insert(
          csl.AssetName.new(toBytes(asset.unit.slice(POLICY_ID_LENGTH))),
          csl.BigNum.from_str(asset.quantity)
        );
      });

    multiAsset.insert(deserializeScriptHash(policyId), policyAssets);
  });

  const value = csl.Value.new(
    csl.BigNum.from_str(lovelace ? lovelace.quantity : '0')
  );

  if (assets.length > 1 || !lovelace) {
    value.set_multiasset(multiAsset);
  }

  return value;
};
