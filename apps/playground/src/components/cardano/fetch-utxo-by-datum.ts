import { resolveDataHash } from "@meshsdk/core";

import { getProvider } from "./mesh-wallet";

export async function fetchAssetUtxo({
  address,
  asset,
  datum,
}: {
  address: string;
  asset: string;
  datum: string;
}) {
  const blockchainProvider = getProvider();
  const utxos = await blockchainProvider.fetchAddressUTxOs(address, asset);
  console.log("utxos", utxos);

  const dataHash = resolveDataHash(datum);

  let utxo = utxos.find((utxo: any) => {
    return utxo.output.dataHash == dataHash;
  });
  console.log("utxo", utxo);
  return utxo;
}
