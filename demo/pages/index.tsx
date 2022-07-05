import { useEffect, useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";

const Home: NextPage = () => {
  const [meshLoaded, setMeshLoaded] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);

  useEffect(() => {
    async function initMesh() {
      await Mesh.init({
        blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY,
        network: 0,
      });
      setMeshLoaded(true);
    }
    initMesh();
  });

  return (
    <div>
      <h1>Mesh Demo</h1>
      {meshLoaded && (
        <DemoConnectWallet setWalletConnected={setWalletConnected} />
      )}
      {walletConnected && <DemoAssets />}
    </div>
  );
};

function DemoConnectWallet({ setWalletConnected }) {
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);

  useEffect(() => {
    async function getWallets() {
      setAvailableWallets(await Mesh.getAvailableWallets());
    }
    getWallets();
  }, []);

  async function connectWallet(walletName: string) {
    let connected = await Mesh.enableWallet({ walletName: walletName });
    if (connected) {
      setWalletConnected(true);
    }
  }

  return (
    <div>
      <h2>Available wallets</h2>

      {availableWallets.map((walletName, i) => (
        <button
          key={walletName}
          onClick={() => connectWallet(walletName)}
          type="button"
        >
          connect wallet ({walletName})
        </button>
      ))}
    </div>
  );
}

function DemoAssets() {
  const [response, setResponse] = useState<any>(undefined);

  async function getLovelace() {
    let lovelace = await Mesh.getLovelace();
    setResponse(lovelace);
  }

  async function getUsedAddresses() {
    let addr = await Mesh.getUsedAddresses();
    setResponse(addr);
  }

  async function getAssets() {
    let assets = await Mesh.getAssets({});
    setResponse(assets);
  }

  async function getAssetsPolicyId() {
    let assets = await Mesh.getAssets({
      policyId: "7bf211c4194614c14dfb9902824df772aeb9277ee600edfb83ab476c",
    });
    setResponse(assets);
  }

  async function getUtxos() {
    let utxo = await Mesh.getUtxos();
    setResponse(utxo);
  }

  async function makeSimpleTransaction() {
    let cbor = await Mesh.makeSimpleTransaction({
      lovelace: 10000000,
    });
    setResponse(cbor);
  }

  return (
    <div>
      <h2>Get assets</h2>

      <button onClick={() => getLovelace()} type="button">
        getLovelace
      </button>

      <button onClick={() => getUsedAddresses()} type="button">
        getUsedAddresses
      </button>

      <button onClick={() => getAssets()} type="button">
        getAssets
      </button>
      <button onClick={() => getAssetsPolicyId()} type="button">
        getAssetsPolicyId
      </button>

      <button onClick={() => getUtxos()} type="button">
        getUtxos
      </button>

      <button onClick={() => makeSimpleTransaction()} type="button">
        makeSimpleTransaction (send ADA)
      </button>

      <h4>Response</h4>
      <pre>{JSON.stringify(response, null, 2)}</pre>
    </div>
  );
}

export default Home;
