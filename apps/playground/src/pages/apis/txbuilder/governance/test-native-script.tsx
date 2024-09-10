import {
  BrowserWallet,
  getFile,
  hashDrepAnchor,
  keepRelevant,
  MeshWallet,
  NativeScript,
  Quantity,
  resolveNativeScriptHash,
  resolvePaymentKeyHash,
  resolveScriptHashDRepId,
  serializeNativeScript,
  Unit,
} from "@meshsdk/core";

import { getProvider } from "~/components/cardano/mesh-wallet";
import { getTxBuilder } from "../common";

const network = 0;

async function getMeshJsonHash(url: string) {
  var drepAnchor = getFile(url);
  const anchorObj = JSON.parse(drepAnchor);
  const anchorHash = hashDrepAnchor(anchorObj);
  return anchorHash;
}

function walletsSign(unsignedTx: string) {
  const { wallet: walletA } = getWallet(walletASeed);
  const { wallet: walletB } = getWallet(walletBSeed);
  // const { wallet: walletC } = getWallet(walletCSeed);

  const signedTx1 = walletA.signTx(unsignedTx, true);
  const signedTx2 = walletB.signTx(signedTx1, true);
  // const signedTx3 =  walletC.signTx(signedTx2, true);
  return signedTx2;
}

export async function voteAction(wallet: BrowserWallet) {
  // test vote
}

export async function deregisterDRep(wallet: BrowserWallet) {
  const { address: scriptAddress, scriptCbor, dRepId } = getNativeScript();

  const blockchainProvider = getProvider();
  const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);
  const assetMap = new Map<Unit, Quantity>();
  assetMap.set("lovelace", "5000000");
  const selectedUtxos = keepRelevant(assetMap, utxos);
  if (selectedUtxos.length === 0) throw new Error("No relevant UTxOs found");

  const txBuilder = getTxBuilder();

  for (let utxo of selectedUtxos) {
    txBuilder.txIn(
      utxo.input.txHash,
      utxo.input.outputIndex,
      utxo.output.amount,
      utxo.output.address,
    );
  }

  txBuilder
    .txInScript(scriptCbor)
    .changeAddress(scriptAddress)
    .drepDeregistrationCertificate(dRepId, "500000000")
    .certificateScript(scriptCbor);

  const unsignedTx = await txBuilder.complete();

  console.log("Unsigned tx", unsignedTx);
  const signedTx = walletsSign(unsignedTx);
  console.log("signedTx", signedTx);

  const txHash = await wallet.submitTx(signedTx);
  console.log("txHash", txHash);
}

export async function registerDRep(wallet: BrowserWallet) {
  const registrationFee = "500000000";

  const blockchainProvider = getProvider();

  const { address: scriptAddress, scriptCbor, dRepId } = getNativeScript();

  const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);
  const assetMap = new Map<Unit, Quantity>();
  assetMap.set("lovelace", registrationFee);
  const selectedUtxos = keepRelevant(assetMap, utxos);
  if (selectedUtxos.length === 0) throw new Error("No relevant UTxOs found");

  //

  const anchorUrl = "https://meshjs.dev/governance/meshjs.jsonld";
  const anchorHash = await getMeshJsonHash(anchorUrl);
  console.log("dRepId", dRepId);

  const txBuilder = getTxBuilder();

  for (let utxo of selectedUtxos) {
    txBuilder.txIn(
      utxo.input.txHash,
      utxo.input.outputIndex,
      utxo.output.amount,
      utxo.output.address,
    );
  }

  txBuilder
    .txInScript(scriptCbor)
    .drepRegistrationCertificate(dRepId, {
      anchorUrl: anchorUrl,
      anchorDataHash: anchorHash,
    })
    .certificateScript(scriptCbor)
    .changeAddress(scriptAddress)
    .selectUtxosFrom(selectedUtxos);

  const unsignedTx = await txBuilder.complete();

  console.log("Unsigned tx", unsignedTx);
  const signedTx = walletsSign(unsignedTx);
  console.log("signedTx", signedTx);

  const txHash = await wallet.submitTx(signedTx);
  console.log("txHash", txHash);
}

export async function makePayment(wallet: BrowserWallet) {
  const amount = "2000000";

  const blockchainProvider = getProvider();

  const { address: scriptAddress, scriptCbor } = getNativeScript();
  const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);

  const assetMap = new Map<Unit, Quantity>();
  assetMap.set("lovelace", amount);

  const selectedUtxos = keepRelevant(assetMap, utxos);

  if (selectedUtxos.length === 0) throw new Error("No relevant UTxOs found");

  const txBuilder = getTxBuilder();

  for (let utxo of selectedUtxos) {
    txBuilder.txIn(
      utxo.input.txHash,
      utxo.input.outputIndex,
      utxo.output.amount,
      utxo.output.address,
    );
  }

  txBuilder
    .txInScript(scriptCbor)
    .txOut("addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr", [
      { unit: "lovelace", quantity: amount },
    ])
    .changeAddress(scriptAddress)
    .selectUtxosFrom(selectedUtxos);

  const unsignedTx = await txBuilder.complete();
  console.log("unsignedTx", unsignedTx);

  const signedTx = walletsSign(unsignedTx);

  const txHash = await wallet.submitTx(signedTx);
  console.log("txHash", txHash);
}

export function getNativeScript() {
  const { walletKeyHash: walletKeyHashA } = getWallet(walletASeed);
  const { walletKeyHash: walletKeyHashB } = getWallet(walletBSeed);
  const { walletKeyHash: walletKeyHashC } = getWallet(walletCSeed);

  let nativeScript: NativeScript = {
    type: "atLeast",
    required: 2,
    scripts: [
      {
        type: "sig",
        keyHash: walletKeyHashA,
      },
      {
        type: "sig",
        keyHash: walletKeyHashB,
      },
      {
        type: "sig",
        keyHash: walletKeyHashC,
      },
    ],
  };

  const dRepId = resolveScriptHashDRepId(resolveNativeScriptHash(nativeScript));
  const { address, scriptCbor } = serializeNativeScript(nativeScript);

  console.log("Native script address", address);

  return { nativeScript, address, dRepId, scriptCbor: scriptCbor! };
}

export function getWallet(seed: string[]) {
  const blockchainProvider = getProvider();
  const wallet = new MeshWallet({
    networkId: network,
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    key: {
      type: "mnemonic",
      words: seed,
    },
  });
  const walletAddress = wallet.getChangeAddress();
  const walletKeyHash = resolvePaymentKeyHash(walletAddress);
  return { wallet, walletAddress, walletKeyHash };
}

// const walletASeed = [
//   "better",
//   "high",
//   "alley",
//   "magnet",
//   "gorilla",
//   "tip",
//   "kidney",
//   "nurse",
//   "angry",
//   "sweet",
//   "scare",
//   "cart",
//   "also",
//   "work",
//   "priority",
//   "try",
//   "stem",
//   "rice",
//   "clutch",
//   "soon",
//   "practice",
//   "amused",
//   "toast",
//   "exile",
// ];
const walletASeed = [
  "culture",
  "enroll",
  "swim",
  "cereal",
  "nose",
  "caution",
  "quantum",
  "sight",
  "shield",
  "audit",
  "south",
  "deputy",
  "find",
  "submit",
  "sister",
  "reduce",
  "ten",
  "prize",
  "track",
  "bird",
  "spring",
  "snap",
  "unfair",
  "word",
];
const walletBSeed = [
  "chronic",
  "bounce",
  "dignity",
  "swim",
  "naive",
  "spread",
  "load",
  "verify",
  "nominee",
  "element",
  "junk",
  "toe",
  "carry",
  "require",
  "silent",
  "this",
  "shallow",
  "hill",
  "blade",
  "jealous",
  "raw",
  "cause",
  "october",
  "until",
];
const walletCSeed = [
  "cabin",
  "bracket",
  "empower",
  "pottery",
  "exhaust",
  "rival",
  "raccoon",
  "pill",
  "sniff",
  "solar",
  "together",
  "fantasy",
  "company",
  "seek",
  "output",
  "sauce",
  "either",
  "goddess",
  "miracle",
  "aim",
  "uncover",
  "expect",
  "joy",
  "various",
];

export default function Placeholder() {}
