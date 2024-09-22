import { InfuraProvider, MaestroProvider, MeshTxBuilder, IFetcher, UTxO } from "@meshsdk/core";
import { AdminAction, ScriptsSetup } from "@/transactions";
import { useWallet } from "@meshsdk/react";
import { TxConstants, oraclePolicyId } from "@/transactions/common";
import { TransferContent, UpdateContent, UserAction } from "@/transactions/user";
import { mConStr0 } from "@sidan-lab/sidan-csl";
import multihashes from "multihashes";
import { toPlutusData } from "../aiken";
import { useEffect, useState } from "react";

const infura = new InfuraProvider(
  process.env.NEXT_PUBLIC_INFURA_PROJECT_ID!,
  process.env.NEXT_PUBLIC_INFURA_PROJECT_SECRET!,
  {}
);

const maestro = new MaestroProvider({ apiKey: process.env.NEXT_PUBLIC_MAESTRO_APIKEY!, network: "Preprod" });
const walletAddress = process.env.NEXT_PUBLIC_WALLET_ADDRESS!;
const skey = process.env.NEXT_PUBLIC_SKEY!;

// 1. Uploading content to IPFS + create content on-chain
// 2. Retrieve content from blockchain, resolve back to content stored in IPFS

export default function Admin() {
  const [isWalletSynced, setIsWalletSynced] = useState(true);
  const [txHash, setTxHash] = useState<string>("");
  const mesh = new MeshTxBuilder({
    fetcher: maestro,
    submitter: maestro,
    evaluator: maestro,
  });

  const { connect, connected, wallet } = useWallet();
  const [txParams, setTxParams] = useState<[MeshTxBuilder, IFetcher, TxConstants]>([
    mesh,
    maestro,
    {
      walletAddress,
      skey,
      collateralUTxO: {
        input: {
          txHash: "3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814",
          outputIndex: 7,
        },
        output: {
          amount: [{ unit: "lovelace", quantity: "10000000" }],
          address: "addr_test1vpw22xesfv0hnkfw4k5vtrz386tfgkxu6f7wfadug7prl7s6gt89x",
        },
      },
    },
  ]);

  useEffect(() => {
    if (wallet && connected) {
      setIsWalletSynced(false);
      wallet.getUsedAddresses().then((addresses) => {
        wallet.getCollateral().then((collateral) => {
          setTxParams((prev) => {
            return [
              prev[0],
              prev[1],
              {
                walletAddress: addresses[0],
                skey,
                collateralUTxO: collateral[0],
              },
            ];
          });
          setIsWalletSynced(true);
        });
      });
    } else if (wallet && !connected) {
      connect("eternl");
    }
  }, [wallet]);

  async function uploadMarkdown() {
    const content = { title: "Hello World", content: "Hello World\n\nThis is my first post!" };

    const blob = new Blob([JSON.stringify(content)], {
      type: "application/json",
    });

    let formData = new FormData();
    formData.append("blob", blob, "test.md");

    const res: any = await infura.uploadContent(formData);
    const ipfsHash: string = res.Hash;

    const ipfsContentBytes = multihashes.fromB58String(ipfsHash);
    const ipfsContentHex = Buffer.from(ipfsContentBytes).toString("hex").slice(4);

    console.log("IPFS Hash", ipfsContentHex, ipfsContentHex.length);

    await createContent(ipfsContentHex);
    // return res;
  }

  const decodeOnchainRecord = (hexString: string) => {
    const decodedBytes = Buffer.from("1220" + hexString, "hex");
    const decodedIpfsHash = multihashes.toB58String(decodedBytes);
    return decodedIpfsHash;
  };

  async function createTokens() {
    // create cip68 tokens so that CID is stored on chain and owner can update it
  }

  const queryUtxos = async () => {
    const plutusData = toPlutusData(mConStr0(["1231512", ["123412", "12512"]]));
    console.log("Plutus Data", plutusData.to_json(1));
  };

  const getUtxosWithMinLovelace = async (lovelace: number, userUtxos: UTxO[] = []) => {
    let utxos: UTxO[];
    if (userUtxos.length === 0) {
      utxos = await maestro.fetchAddressUTxOs(walletAddress);
    } else {
      utxos = userUtxos;
    }
    return utxos.filter((u) => {
      const lovelaceAmount = u.output.amount.find((a: any) => a.unit === "lovelace")?.quantity;
      return Number(lovelaceAmount) > lovelace;
    });
  };

  const getUtxosWithToken = async (assetHex: string, userUtxos: UTxO[] = []) => {
    let utxos: UTxO[];
    if (userUtxos.length === 0) {
      utxos = await maestro.fetchAddressUTxOs(walletAddress);
    } else {
      utxos = userUtxos;
    }
    return utxos.filter((u) => {
      const assetAmount = u.output.amount.find((a: any) => a.unit === assetHex)?.quantity;
      return Number(assetAmount) >= 1;
    });
  };

  const setup = new ScriptsSetup(...txParams);
  const admin = new AdminAction(...txParams);
  const user = new UserAction(...txParams);

  const mintOneTimeMintingPolicy = async () => {
    const utxo = await getUtxosWithMinLovelace(100000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const confirmTxHash = await setup.mintOneTimeMintingPolicy(txHash, txId);
    console.log("TxHash", confirmTxHash);
  };
  const sendRefScriptOnchain = async () => {
    const utxo = await getUtxosWithMinLovelace(100000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const confirmTxHash = await setup.sendRefScriptOnchain(txHash, txId, "OwnershipRegistry");
    console.log("TxHash", confirmTxHash);
  };

  const sendOracleNFTtoScript = async () => {
    const utxo = await getUtxosWithMinLovelace(100000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const nftUtxo = await getUtxosWithToken(oraclePolicyId);
    const nftTxHash = nftUtxo[0].input.txHash;
    const nftTxId = nftUtxo[0].input.outputIndex;
    const confirmTxHash = await setup.setupOracleUtxo(txHash, txId, nftTxHash, nftTxId);
    console.log("TxHash", confirmTxHash);
  };

  const createContentRegistry = async () => {
    const utxo = await getUtxosWithMinLovelace(10000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const confirmTxHash = await setup.createContentRegistry(txHash, txId);
    console.log("TxHash", confirmTxHash);
  };

  const createOwnershipRegistry = async () => {
    const utxo = await getUtxosWithMinLovelace(20000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const confirmTxHash = await setup.createOwnershipRegistry(txHash, txId);
    console.log("TxHash", confirmTxHash);
  };

  const stopContentRegistry = async () => {
    const utxo = await getUtxosWithMinLovelace(20000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const txBody = await admin.stopContentRegistry(txHash, txId, 1);
    const signedTx = await wallet.signTx(txBody, true);
    const confirmTxHash = await maestro.submitTx(signedTx);
    console.log("TxHash", confirmTxHash);
  };

  const stopOwnershipRegistry = async () => {
    const utxo = await getUtxosWithMinLovelace(20000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const txBody = await admin.stopOwnershipRegistry(txHash, txId, 1);
    const signedTx = await wallet.signTx(txBody, true);
    const confirmTxHash = await maestro.submitTx(signedTx);
    console.log("TxHash", confirmTxHash);
  };

  const stopOracle = async () => {
    const utxo = await getUtxosWithMinLovelace(20000000);
    const txHash = utxo[0].input.txHash;
    const txId = utxo[0].input.outputIndex;
    const txBody = await admin.stopOracle(txHash, txId);
    const signedTx = await wallet.signTx(txBody, true);
    const confirmTxHash = await maestro.submitTx(signedTx);
    console.log("TxHash", confirmTxHash);
  };

  // const longestTokenNamePossible =
  // "5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b3132333435363738393031323334353637383930313233343536373839303132";

  const createContent = async (contentHex = "ff942613ef86667df9e8f2488f29615fc9aaad7906e266f686153d5b7c81abe0") => {
    const utxos = await wallet.getUtxos();
    const utxo = await getUtxosWithMinLovelace(20000000, utxos);
    const txHex = await user.createContent(
      utxo[0],
      // longestTokenNamePossible,
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e67646973636f756e742e616461",
      contentHex,
      4
    );
    const signedTx = await wallet.signTx(txHex, true);
    const txHash = await wallet.submitTx(signedTx);
    setTxHash(txHash);
    console.log("TxHash", txHash);
  };

  const contentNumber = 15;

  const updateContent = async (contentHex = "ff942613ef86667df9e8f2488f29615fc9aaad7906e266f686153d5b7c81abe0") => {
    const allUtxos = await wallet.getUtxos();
    const utxo = await getUtxosWithMinLovelace(20000000, allUtxos);
    const ownerTokenUtxo = await getUtxosWithToken(
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e67646973636f756e742e616461",
      allUtxos
    );
    const updateContentParams: UpdateContent = {
      feeUtxo: utxo[0],
      ownerTokenUtxo: ownerTokenUtxo[0],
      walletAddress: txParams[2].walletAddress,
      registryNumber: 4,
      newContentHashHex: contentHex,
      contentNumber,
    };
    console.log(`Update Content Params`, updateContentParams);

    const txBody = await user.updateContent(updateContentParams);
    const signedTx = await wallet.signTx(txBody, true);
    const confirmTxHash = await maestro.submitTx(signedTx);
    setTxHash(confirmTxHash);
    console.log("TxHash", confirmTxHash);
  };

  const transferContent = async () => {
    const allUtxos = await wallet.getUtxos();
    const utxo = await getUtxosWithMinLovelace(20000000, allUtxos);
    const ownerTokenUtxo = await getUtxosWithToken(
      "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e67646973636f756e742e616461",
      allUtxos
    );
    const updateContentParams: TransferContent = {
      feeUtxo: utxo[0],
      ownerTokenUtxo: ownerTokenUtxo[0],
      walletAddress: txParams[2].walletAddress,
      registryNumber: 4,
      newOwnerAssetHex:
        "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e67646973636f756e742e616461",
      contentNumber,
    };
    const txBody = await user.transferContent(updateContentParams);
    const signedTx = await wallet.signTx(txBody, true);
    const confirmTxHash = await maestro.submitTx(signedTx);
    setTxHash(confirmTxHash);
    console.log("TxHash", confirmTxHash);
  };

  return (
    <main>
      <span className="text-black">Connected: {connected ? "Yes" : "No"}</span>
      <button
        className="m-2 p-2 bg-slate-500"
        onClick={() => {
          connect("eternl");
        }}>
        Connect Eternl
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => sendRefScriptOnchain()}>
        Send Ref Script
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => mintOneTimeMintingPolicy()}>
        Mint Oracle NFT
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => sendOracleNFTtoScript()}>
        Send Oracle NFT
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => createContentRegistry()}>
        Create Content Registry
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => createOwnershipRegistry()}>
        Create Ownership Registry
      </button>
      <button
        className={isWalletSynced ? "m-2 p-2 bg-blue-500" : "m-2 p-2 bg-blue-200"}
        onClick={() => createContent()}>
        Create Content
      </button>
      <button
        className={isWalletSynced ? "m-2 p-2 bg-blue-500" : "m-2 p-2 bg-blue-200"}
        onClick={() => updateContent()}>
        Update Content
      </button>
      <button
        className={isWalletSynced ? "m-2 p-2 bg-blue-500" : "m-2 p-2 bg-blue-200"}
        onClick={() => transferContent()}>
        Transfer Content
      </button>
      <button
        className={isWalletSynced ? "m-2 p-2 bg-blue-500" : "m-2 p-2 bg-blue-200"}
        onClick={() => uploadMarkdown()}>
        Test: Upload MD
      </button>
      <button className="m-2 p-2 bg-red-400" onClick={() => stopContentRegistry()}>
        Stop Content Registry
      </button>
      <button className="m-2 p-2 bg-red-400" onClick={() => stopOwnershipRegistry()}>
        Stop Ownership Registry
      </button>
      <button className="m-2 p-2 bg-red-400" onClick={() => stopOracle()}>
        Stop Oracle
      </button>
      <button className="m-2 p-2 bg-slate-500" onClick={() => queryUtxos()}>
        Test
      </button>
      <p className="text-blue-500">https://preprod.cardanoscan.io/transaction/{txHash}</p>
    </main>
  );
}
