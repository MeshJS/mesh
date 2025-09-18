import { IFetcher, parseAssetUnit, UTxO } from "@meshsdk/common";
import { toTxUnspentOutput } from "@meshsdk/core-cst";

import {
  BlockfrostAdditionalUtxo,
  BlockfrostAdditionalUtxos,
  BlockfrostAdditionalUtxoValue,
  KoiosAdditionalUtxo,
  KoiosAdditionalUtxos,
  MaestroAdditionalUtxo,
  MaestroAdditionalUtxos,
} from "../types";

type OutputFormat = "koios" | "maestro" | "blockfrost";

export async function getAdditionalUtxos(
  provider: IFetcher,
  format: OutputFormat,
  additionalUtxos?: UTxO[],
  additionalTxs?: string[],
): Promise<
  MaestroAdditionalUtxos | KoiosAdditionalUtxos | BlockfrostAdditionalUtxos
> {
  const foundUtxos = new Set<string>();
  const uniqueUtxos: UTxO[] = [];

  if (!additionalUtxos && !additionalTxs) return [];

  if (additionalUtxos) {
    for (const utxo of additionalUtxos) {
      addUniqueUtxo(utxo, foundUtxos, uniqueUtxos);
    }
  }

  if (additionalTxs) {
    for (const txHash of additionalTxs) {
      // should use offline function to get transaction outputs(utxos)
      // const outputs = getTransactionOutputs(txHash);
      const utxos = await provider.fetchUTxOs(txHash);

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
