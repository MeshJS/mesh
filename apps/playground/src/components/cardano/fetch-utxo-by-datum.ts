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
  const provider = getProvider();
  const utxos = await provider.fetchAddressUTxOs(address, asset);

  const dataHash = resolveDataHash(datum);

  let utxo = utxos.find((utxo: any) => {
    return utxo.output.dataHash == dataHash;
  });

  return utxo;
}
