import { useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock } from "../../components";

export default function WalletApi() {
  const [response, setResponse] = useState<null | any>(null);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);

  async function isEnabled() {
    return Mesh.wallet.isEnabled();
  }

  async function getNetworkId() {
    return Mesh.wallet.getNetworkId();
  }

  async function getUtxos() {
    return Mesh.wallet.getUtxos();
  }

  async function getBalance() {
    return Mesh.wallet.getBalance();
  }

  async function getUsedAddresses() {
    return Mesh.wallet.getUsedAddresses();
  }

  async function getUnusedAddresses() {
    return Mesh.wallet.getUnusedAddresses();
  }

  async function getChangeAddress() {
    return Mesh.wallet.getChangeAddress();
  }

  async function getRewardAddresses() {
    return Mesh.wallet.getRewardAddresses();
  }

  async function getWalletAddress() {
    return Mesh.wallet.getWalletAddress();
  }

  async function getLovelace() {
    return Mesh.wallet.getLovelace();
  }

  async function getAssets() {
    return Mesh.wallet.getAssets({});
  }

  return (
    <>
      <DemoSection
        title="Is wallet enabled"
        desc="Check if wallet is enabled."
        demoFn={isEnabled}
      />

      <DemoSection
        title="Get network ID"
        desc="Get network ID. 0 is testnet, 1 is mainnet."
        demoFn={getNetworkId}
      />

      <DemoSection
        title="Get UTXOs"
        desc="Get wallet's UTXOs"
        demoFn={getUtxos}
      />

      <DemoSection title="Get balance" desc="Get balance" demoFn={getBalance} />

      <DemoSection
        title="Get used address"
        desc="Get used address"
        demoFn={getUsedAddresses}
      />

      <DemoSection
        title="Get unused address"
        desc="Get unused address"
        demoFn={getUnusedAddresses}
      />

      <DemoSection
        title="Get change address"
        desc="Get change address"
        demoFn={getChangeAddress}
      />

      <DemoSection
        title="Get reward address"
        desc="Get reward address"
        demoFn={getRewardAddresses}
      />

      <DemoSection
        title="Get wallet address"
        desc="Get the first used address."
        demoFn={getWalletAddress}
      />

      <DemoSection
        title="Get lovelace amount"
        desc="Get lovelace amount"
        demoFn={getLovelace}
      />

      <DemoSection title="Get assets" desc="Get assets" demoFn={getAssets} />

      <DemoAssetsPolicyId />

      {/* <div className="m-2 p-2 bg-white shadow rounded w-full">
        <div className="flex justify-between items-center">
          <input
            className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            type="text"
            placeholder="policy ID"
          />
          <div className="flex justify-center items-center space-x-2">
            <Button
              onClick={() => getAssetsPolicyId()}
              style={selectedApi == "getAssetsPolicyId" ? "success" : "primary"}
            >
              getAssetsPolicyId
            </Button>
          </div>
        </div>
      </div>
      {response !== null && (
        <>
          <h4>Response</h4>
          <Codeblock data={response} />
        </>
      )} */}
    </>
  );
}

function DemoSection({ title, desc, demoFn }) {
  const [response, setResponse] = useState<null | any>(null);
  async function runDemo() {
    let results = await demoFn();
    setResponse(results);
  }

  return (
    <section className="bg-white dark:bg-gray-900 mt-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <h2 className="text-2xl dark:text-white">{title}</h2>
          <p className="font-light text-gray-500 sm:text-lg dark:text-gray-400">
            {desc}
          </p>
        </div>

        <div className="flex-1">
          {response !== null ? (
            <Codeblock data={response} />
          ) : (
            <Button onClick={() => runDemo()}>Try it</Button>
          )}
        </div>
      </div>
    </section>
  );
}

function DemoAssetsPolicyId() {
  const [response, setResponse] = useState<null | any>(null);
  const [policyId, setPolicyId] = useState(
    "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2"
  );

  async function runDemo() {
    const res = await Mesh.wallet.getAssets({
      policyId: policyId,
    });
    setResponse(res);
  }

  return (
    <section className="bg-white dark:bg-gray-900 mt-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <h2 className="text-2xl dark:text-white">
            Get assets and filtered by policy ID
          </h2>
          <p className="font-light text-gray-500 sm:text-lg dark:text-gray-400">
            Get assets and filtered by policy ID
          </p>
        </div>

        <div className="flex-1">
          {response !== null ? (
            <Codeblock data={response} />
          ) : (
            <>
              <input
                className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
                value={policyId}
                onChange={(e) => setPolicyId(e.target.value)}
                type="text"
                placeholder="policy ID"
              />
              <Button onClick={() => runDemo()}>Try it</Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
