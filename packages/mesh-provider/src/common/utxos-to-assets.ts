import { UTxO } from "@meshsdk/common";

export function utxosToAssets(utxos: UTxO[]): { [key: string]: string } {
  const _balance = utxos
    .map((utxo) => {
      return utxo.output.amount;
    })
    .reduce(
      (acc, amount) => {
        for (const asset of amount) {
          if (asset) {
            if (acc[asset.unit] == undefined) {
              acc[asset.unit] = 0;
            }
            if (asset.unit in acc) {
              acc[asset.unit]! += parseFloat(asset.quantity);
            }
          }
        }
        return acc;
      },
      {} as { [key: string]: number },
    );

  return Object.fromEntries(
    Object.entries(_balance).map(([key, value]) => [key, value.toString()]),
  );
}
