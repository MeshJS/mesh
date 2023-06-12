import { mnemonicToEntropy } from 'bip39';
import { AssetFingerprint, csl } from '@mesh/core';
import { IFetcher } from '@mesh/common/contracts';
import {
  SUPPORTED_CLOCKS, DEFAULT_PROTOCOL_PARAMETERS, SUPPORTED_LANGUAGE_VIEWS,
} from '@mesh/common/constants';
import {
  buildBip32PrivateKey, buildRewardAddress,
} from './builder';
import {
  fromBytes,
  toAddress, toBaseAddress, toBytes, toEnterpriseAddress,
  toNativeScript, toPlutusData, toRewardAddress, toScriptRef, toUTF8,
} from './converter';
import {
  deserializePlutusScript, deserializeTx,
} from './deserializer';
import type {
  Asset, Data, Era, LanguageVersion, NativeScript, Network, PlutusScript, TxInput, TxMetadata, TxOutput,
} from '@mesh/common/types';

export const resolveDataHash = (data: Data) => {
  const plutusData = toPlutusData(data);
  const dataHash = csl.hash_plutus_data(plutusData);
  return dataHash.to_hex();
};

export const resolveEpochNo = (network: Network, milliseconds = Date.now()) => {
  if (SUPPORTED_CLOCKS[network]) {
    const [
      epoch, _, systemStart, epochLength,
    ] = SUPPORTED_CLOCKS[network];

    return parseInt(csl.BigNum
      .from_str(milliseconds.toString())
      .div_floor(csl.BigNum.from_str('1000'))
      .checked_sub(csl.BigNum.from_str(systemStart))
      .div_floor(csl.BigNum.from_str(epochLength))
      .checked_add(csl.BigNum.from_str(epoch))
      .to_str(), 10);
  }

  throw new Error(`Couldn't resolve EpochNo for network: ${network}`);
};

export const resolveFingerprint = (policyId: string, assetName: string) => {
  return AssetFingerprint.fromParts(
    toBytes(policyId),
    toBytes(assetName)
  ).fingerprint();
};

export const resolveLanguageView = (era: Era, version: LanguageVersion) => {
  return SUPPORTED_LANGUAGE_VIEWS[era][version];
};

export const resolveNativeScriptHash = (script: NativeScript) => {
  return toNativeScript(script).hash().to_hex();
};

export const resolvePaymentKeyHash = (bech32: string) => {
  try {
    const paymentKeyHash = [
      toBaseAddress(bech32)?.payment_cred().to_keyhash(),
      toEnterpriseAddress(bech32)?.payment_cred().to_keyhash(),
    ].find((kh) => kh !== undefined);

    if (paymentKeyHash !== undefined)
      return paymentKeyHash.to_hex();

    throw new Error(`Couldn't resolve payment key hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolvePaymentKeyHash: ${error}.`);
  }
};

export const resolvePlutusScriptAddress = (script: PlutusScript, networkId = 0) => {
  const plutusScript = deserializePlutusScript(script.code, script.version);

  const enterpriseAddress = csl.EnterpriseAddress.new(networkId,
    csl.StakeCredential.from_scripthash(plutusScript.hash()),
  );

  return enterpriseAddress.to_address().to_bech32();
};

export const resolvePlutusScriptHash = (bech32: string) => {
  try {
    const enterpriseAddress = toEnterpriseAddress(bech32);
    const scriptHash = enterpriseAddress?.payment_cred()
      .to_scripthash();

    if (scriptHash !== undefined)
      return scriptHash.to_hex();

    throw new Error(`Couldn't resolve script hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveScriptHash: ${error}.`);
  }
};

export const resolvePoolId = (hash: string) => {
  return csl.Ed25519KeyHash.from_hex(hash).to_bech32('pool1');
};

export const resolvePrivateKey = (words: string[]) => {
  const entropy = mnemonicToEntropy(words.join(' '));
  const bip32PrivateKey = buildBip32PrivateKey(entropy);
  const bech32PrivateKey = bip32PrivateKey.to_bech32();

  bip32PrivateKey.free();

  return bech32PrivateKey;
};

export const resolveScriptRef = (script: PlutusScript | NativeScript) => {
  return toScriptRef(script).to_hex();
};

export const resolveSlotNo = (network: Network, milliseconds = Date.now()) => {
  if (SUPPORTED_CLOCKS[network]) {
    const [_, slot, systemStart] = SUPPORTED_CLOCKS[network];

    return csl.BigNum
      .from_str(milliseconds.toString())
      .div_floor(csl.BigNum.from_str('1000'))
      .checked_sub(csl.BigNum.from_str(systemStart))
      .checked_add(csl.BigNum.from_str(slot))
      .to_str();
  }

  throw new Error(`Couldn't resolve SlotNo for network: ${network}`);
};

export const resolveRewardAddress = (bech32: string) => {
  try {
    const address = toAddress(bech32);
    const baseAddress = toBaseAddress(bech32);
    const stakeKeyHash = baseAddress?.stake_cred().to_keyhash();

    if (stakeKeyHash !== undefined)
      return buildRewardAddress(address.network_id(), stakeKeyHash)
        .to_address().to_bech32();

    throw new Error(`Couldn't resolve reward address from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveRewardAddress: ${error}.`);
  }
};

export const resolveStakeKeyHash = (bech32: string) => {
  try {
    const stakeKeyHash = [
      toBaseAddress(bech32)?.stake_cred().to_keyhash(),
      toRewardAddress(bech32)?.payment_cred().to_keyhash(),
    ].find((kh) => kh !== undefined);

    if (stakeKeyHash !== undefined)
      return stakeKeyHash.to_hex();

    throw new Error(`Couldn't resolve stake key hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveStakeKeyHash: ${error}.`);
  }
};

export const resolveTxFees = (
  txSize: number,
  minFeeA = DEFAULT_PROTOCOL_PARAMETERS.minFeeA,
  minFeeB = DEFAULT_PROTOCOL_PARAMETERS.minFeeB,
) => {
  const fees = BigInt(minFeeA)
    * BigInt(txSize)
    + BigInt(minFeeB);

  return fees.toString();
};

export const resolveTxHash = (txHex: string) => {
  const txBody = deserializeTx(txHex).body();
  const txHash = csl.hash_transaction(txBody);
  return txHash.to_hex();
};

export const decodeTransaction = async (
  transactionHex: string,
  provider: IFetcher
): Promise<{ input: TxInput[], recipient: TxOutput[], metadata: TxMetadata, fee: number }> => {
  const txInputs: {
    [key: string]: { amount: number; assets: { [key: string]: number } };
  } = {};
  const txOutputs: {
    [key: string]: { amount: number; assets: { [key: string]: number } };
  } = {};

  const transaction = csl.Transaction.from_hex(transactionHex);
  const transaction_body = transaction.body();
  const outputs = transaction_body.outputs();
  const inputs = transaction_body.inputs();

  for (let inputIndex = 0; inputIndex < inputs.len(); inputIndex++) {
    const input = inputs.get(inputIndex);
    const txIndex = input.index();
    const txHash = input.transaction_id().to_hex();

    const txUTxOs = await provider.fetchTransactionUTxOs(txHash);
    const txInput = txUTxOs?.outputs.find(
      (output) => output.output_index === txIndex
    );

    if (txInput && !txInputs[txInput.address]) {
      txInputs[txInput.address] = {
        amount: 0,
        assets: {},
      };
    }

    const inputAddress = txInput?.address;
    if (inputAddress && txInputs[inputAddress]) {
      txInput?.amount?.forEach((amount: Asset) => {
        if (amount.unit === 'lovelace') {
          txInputs[inputAddress].amount += parseInt(amount.quantity);
        } else {
          const assetName = amount.unit.slice(56);
          const unit = amount.unit.slice(0, 56) + '.' + toUTF8(assetName);
          txInputs[inputAddress].assets[unit] =
            (txInputs[inputAddress].assets[unit] || 0) +
            parseInt(amount.quantity);
        }
      });
    }
  }

  for (let outputIndex = 0; outputIndex < outputs.len(); outputIndex++) {
    const outputTransaction = outputs.get(outputIndex);
    const outputAddress = outputTransaction.address().to_bech32().toString();

    if (!txOutputs[outputAddress]) {
      txOutputs[outputAddress] = {
        amount: 0,
        assets: {},
      };
    }

    txOutputs[outputAddress].amount += parseInt(
      outputTransaction.amount().coin().to_str()
    );

    if (outputTransaction.amount().multiasset()) {
      const multiAssets = outputTransaction.amount().multiasset();

      if (multiAssets) {
        const multiAssetKeys = multiAssets.keys();

        for (
          let assetsKeyIndex = 0;
          assetsKeyIndex < multiAssetKeys.len();
          assetsKeyIndex++
        ) {
          const assetsKey = multiAssetKeys.get(assetsKeyIndex);
          const assets = multiAssets.get(assetsKey);

          if (assets) {
            const assetKeys = assets.keys();
            const policyId = assetsKey.to_hex();

            for (
              let assetKeyIndex = 0;
              assetKeyIndex < assetKeys.len();
              assetKeyIndex++
            ) {
              const asset = assetKeys.get(assetKeyIndex);
              const assetNum = assets.get(asset);
              const unit = policyId + '.' + toUTF8(fromBytes(asset.name()));

              txOutputs[outputAddress].assets[unit] = parseInt(
                assetNum?.to_str() || '0'
              );
            }
          }
        }
      }
    }
  }

  const auxiliary_data = transaction.auxiliary_data();
  const metadata: { [key: string]: string } = {};

  if (auxiliary_data) {
    const _metadata = auxiliary_data.metadata();

    if (_metadata) {
      const metadataKeys = _metadata.keys();

      for (
        let metadataKeyIndex = 0;
        metadataKeyIndex < metadataKeys.len();
        metadataKeyIndex++
      ) {
        const metadataKey = metadataKeys.get(metadataKeyIndex);
        const metadataRaw = _metadata.get(metadataKey);
        if (metadataRaw) {
          const metadataJson = JSON.parse(
            csl.decode_metadatum_to_json_str(metadataRaw, 0)
          );
          metadata[metadataKey.to_str()] = metadataJson;
        }
      }
    }
  }

  for (const senderAddress in txInputs) {
    if (txOutputs[senderAddress]) {
      txInputs[senderAddress].amount -= txOutputs[senderAddress].amount;
      txOutputs[senderAddress].amount = 0;

      for (const unit in txOutputs[senderAddress].assets) {
        if (txInputs[senderAddress].assets[unit]) {
          txInputs[senderAddress].assets[unit] -=
            txOutputs[senderAddress].assets[unit];
          txOutputs[senderAddress].assets[unit] = 0;
          delete txOutputs[senderAddress].assets[unit];

          if (txInputs[senderAddress].assets[unit] === 0) {
            delete txInputs[senderAddress].assets[unit];
          }
        }
      }
    }
  }

  const txOutputsFinal = Object.entries(txOutputs)
    .filter(
      ([_, value]) => value.amount > 0 || Object.keys(value.assets).length > 0
    )
    .map(([key, value]) => ({ address: key, ...value }));

  const txInputsFinal = Object.entries(txInputs).map(([key, value]) => ({
    address: key,
    ...value,
  }));

  let inputValue = 0;
  let outputValue = 0;

  for (const r of txOutputsFinal) {
    outputValue += r.amount;
  }

  for (const s of txInputsFinal) {
    inputValue += s.amount;
  }

  const fee = inputValue - outputValue;

  return {
    input: txInputsFinal,
    recipient: txOutputsFinal,
    metadata,
    fee
  };
};