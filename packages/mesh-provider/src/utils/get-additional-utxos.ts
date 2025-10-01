import { parseAssetUnit, UTxO } from "@meshsdk/common";
import {
  deserializeTx,
  fromTxUnspentOutput,
  toTxUnspentOutput,
  TransactionId,
  TransactionInput,
  TransactionUnspentOutput,
} from "@meshsdk/core-cst";

import {
  BlockfrostAdditionalUtxo,
  BlockfrostAdditionalUtxos,
  BlockfrostAdditionalUtxoValue,
  KoiosAdditionalUtxo,
  KoiosAdditionalUtxos,
  MaestroAdditionalUtxo,
  MaestroAdditionalUtxos,
  OgmiosAdditionalUtxo,
  OgmiosAdditionalUtxos,
} from "../types";

type OutputFormat = "koios" | "maestro" | "blockfrost" | "ogmios";

/**
 * Extract UTxOs from transaction CBOR hex string
 * @param txCbor - Transaction in CBOR hex format
 * @returns Array of UTxOs parsed from the transaction outputs
 */
function getTransactionOutputsFromCbor(txCbor: string): UTxO[] {
  const tx = deserializeTx(txCbor);
  const txBody = tx.body();
  const txHash = tx.getId();
  const outputs = txBody.outputs();
  const utxos: UTxO[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (output) {
      const txInput = new TransactionInput(TransactionId(txHash), BigInt(i));
      const txUnspentOutput = new TransactionUnspentOutput(txInput, output);
      const utxo = fromTxUnspentOutput(txUnspentOutput);
      utxos.push(utxo);
    }
  }

  return utxos;
}

export function getAdditionalUtxos(
  format: OutputFormat,
  additionalUtxos?: UTxO[],
  additionalTxs?: string[],
):
  | MaestroAdditionalUtxos
  | KoiosAdditionalUtxos
  | BlockfrostAdditionalUtxos
  | OgmiosAdditionalUtxos {
  const foundUtxos = new Set<string>();
  const uniqueUtxos: UTxO[] = [];

  if (!additionalUtxos && !additionalTxs) return [];

  if (additionalUtxos) {
    for (const utxo of additionalUtxos) {
      addUniqueUtxo(utxo, foundUtxos, uniqueUtxos);
    }
  }

  if (additionalTxs) {
    for (const txCbor of additionalTxs) {
      const utxos = getTransactionOutputsFromCbor(txCbor);

      for (const utxo of utxos) {
        addUniqueUtxo(utxo, foundUtxos, uniqueUtxos);
      }
    }
  }

  const result = {
    koios: uniqueUtxos.map<KoiosAdditionalUtxo>((utxo) => [
      {
        transaction: { id: utxo.input.txHash },
        output: { index: utxo.input.outputIndex },
      },
      {
        address: utxo.output.address,
        value: utxo.output.amount.reduce<Record<string, string>>(
          (acc, { unit, quantity }) => {
            acc[unit] = quantity;
            return acc;
          },
          {},
        ),
      },
    ]),

    maestro: uniqueUtxos.map<MaestroAdditionalUtxo>((utxo) => {
      const txUnspentOutput = toTxUnspentOutput(utxo);
      const cborHex = txUnspentOutput.output().toCbor();
      return {
        tx_hash: utxo.input.txHash,
        index: utxo.input.outputIndex,
        txout_cbor: cborHex,
      };
    }),

    blockfrost: uniqueUtxos.map<BlockfrostAdditionalUtxo>((utxo) => {
      return {
        transaction: {
          id: utxo.input.txHash,
        },
        index: utxo.input.outputIndex,
        address: utxo.output.address,
        value: parseValue(utxo),
      };
    }),

    ogmios: uniqueUtxos.map<OgmiosAdditionalUtxo>((utxo) => {
      return {
        transaction: {
          id: utxo.input.txHash,
        },
        index: utxo.input.outputIndex,
        address: utxo.output.address,
        value: parseValue(utxo),
      };
    }),
  };

  return result[format];
}

const parseValue = (utxo: UTxO): BlockfrostAdditionalUtxoValue => {
  const value = utxo.output.amount.reduce((acc, { unit, quantity }) => {
    if (unit === "lovelace") {
      acc.ada = { lovelace: Number(quantity) };
    } else {
      const { policyId, assetName } = parseAssetUnit(unit);
      if (!acc[policyId]) acc[policyId] = {};
      acc[policyId][assetName] = Number(quantity);
    }
    return acc;
  }, {} as BlockfrostAdditionalUtxoValue);

  return value;
};

const addUniqueUtxo = (utxo: UTxO, set: Set<string>, list: UTxO[]) => {
  const key = `${utxo.input.txHash}:${utxo.input.outputIndex}`;
  if (!set.has(key)) {
    set.add(key);
    list.push(utxo);
  }
};
