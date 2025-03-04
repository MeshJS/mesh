import {
  IWallet,
  PlutusScript,
  resolveDataHash,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";

import { getProvider } from "~/components/cardano/mesh-wallet";
import { linksAiken } from "~/data/links-aiken";

export function getPageLinks() {
  const sidebarItems = linksAiken.map((link) => ({
    label: link.title,
    to: link.link,
  }));
  return sidebarItems;
}

export const compiledCode = `58f0010000323232323232323222232325333008323232533300b002100114a06644646600200200644a66602200229404c8c94ccc040cdc78010028a511330040040013014002375c60240026eb0c038c03cc03cc03cc03cc03cc03cc03cc03cc020c008c020014dd71801180400399b8f375c6002600e00a91010d48656c6c6f2c20576f726c6421002300d001149858c94ccc020cdc3a400000226464a66601a601e0042930b1bae300d00130060041630060033253330073370e900000089919299980618070010a4c2c6eb8c030004c01401058c01400c8c014dd5000918019baa0015734aae7555cf2ab9f5742ae89`;

export async function getWalletAddress(wallet: IWallet) {
  const addresses = await wallet.getUsedAddresses();
  const address = addresses[0];

  if (!address) {
    throw new Error("No address found");
  }

  const hash = resolvePaymentKeyHash(address);
  return { address, hash };
}

export function getScript() {
  const scriptCbor = applyParamsToScript(compiledCode, []);

  const script: PlutusScript = {
    code: scriptCbor,
    version: "V2",
  };
  const scriptAddress = resolvePlutusScriptAddress(script, 0);
  return { script, scriptAddress };
}

export async function getAssetUtxo({
  scriptAddress,
  asset,
  datum,
}: {
  scriptAddress: string;
  asset: string;
  datum: any;
}) {
  const provider = getProvider();
  const utxos = await provider.fetchAddressUTxOs(
    scriptAddress,
    asset,
  );

  const dataHash = resolveDataHash(datum);

  let utxo = utxos.find((utxo: any) => {
    return utxo.output.dataHash == dataHash;
  });

  return utxo;
}

export default function Placeholder() {}
