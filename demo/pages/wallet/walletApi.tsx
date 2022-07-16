import { useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock } from "../../components";

export default function WalletApi() {
  const [response, setResponse] = useState<null | any>(null);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState(
    "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2"
  );

  async function isEnabled() {
    const res = await Mesh.wallet.isEnabled();
    setResponse(res);
    setSelectedApi("isEnabled");
  }

  async function getNetworkId() {
    const res = await Mesh.wallet.getNetworkId();
    setResponse(res);
    setSelectedApi("getNetworkId");
  }

  async function getUtxos() {
    const res = await Mesh.wallet.getUtxos();
    setResponse(res);
    setSelectedApi("getUtxos");
  }

  async function getBalance() {
    const res = await Mesh.wallet.getBalance();
    setResponse(res);
    setSelectedApi("getBalance");
  }

  async function getUsedAddresses() {
    const res = await Mesh.wallet.getUsedAddresses();
    setResponse(res);
    setSelectedApi("getUsedAddresses");
  }

  async function getUnusedAddresses() {
    const res = await Mesh.wallet.getUnusedAddresses();
    setResponse(res);
    setSelectedApi("getUnusedAddresses");
  }

  async function getChangeAddress() {
    const res = await Mesh.wallet.getChangeAddress();
    setResponse(res);
    setSelectedApi("getChangeAddress");
  }

  async function getRewardAddresses() {
    const res = await Mesh.wallet.getRewardAddresses();
    setResponse(res);
    setSelectedApi("getRewardAddresses");
  }

  async function getWalletAddress() {
    const res = await Mesh.wallet.getWalletAddress();
    setResponse(res);
    setSelectedApi("getWalletAddress");
  }

  async function getLovelace() {
    const res = await Mesh.wallet.getLovelace();
    setResponse(res);
    setSelectedApi("getLovelace");
  }

  async function getAssets() {
    const res = await Mesh.wallet.getAssets({});
    setResponse(res);
    setSelectedApi("getAssets");
  }

  async function getAssetsPolicyId() {
    const res = await Mesh.wallet.getAssets({
      policyId: policyId,
    });
    setResponse(res);
    setSelectedApi("getAssetsPolicyId");
  }

  return (
    <>
      <h3>Wallet APIs</h3>
      <p>
        These wallet APIs are in accordance to{" "}
        <a href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030">
          Cardano Improvement Proposals 30 - Cardano dApp-Wallet Web Bridge
        </a>
        , which defines the API for dApps to communicate with the user&apos;s wallet.
      </p>
      ​
      <Button
        onClick={() => isEnabled()}
        style={selectedApi == "isEnabled" ? "success" : "primary"}
      >
        isEnabled
      </Button>
      <Button
        onClick={() => getNetworkId()}
        style={selectedApi == "getNetworkId" ? "success" : "primary"}
      >
        getNetworkId
      </Button>
      <Button
        onClick={() => getUtxos()}
        style={selectedApi == "getUtxos" ? "success" : "primary"}
      >
        getUtxos
      </Button>
      <Button
        onClick={() => getBalance()}
        style={selectedApi == "getBalance" ? "success" : "primary"}
      >
        getBalance
      </Button>
      <Button
        onClick={() => getUsedAddresses()}
        style={selectedApi == "getUsedAddresses" ? "success" : "primary"}
      >
        getUsedAddresses
      </Button>
      <Button
        onClick={() => getUnusedAddresses()}
        style={selectedApi == "getUnusedAddresses" ? "success" : "primary"}
      >
        getUnusedAddresses
      </Button>
      <Button
        onClick={() => getChangeAddress()}
        style={selectedApi == "getChangeAddress" ? "success" : "primary"}
      >
        getChangeAddress
      </Button>
      <Button
        onClick={() => getRewardAddresses()}
        style={selectedApi == "getRewardAddresses" ? "success" : "primary"}
      >
        getRewardAddresses
      </Button>
      <Button
        onClick={() => getWalletAddress()}
        style={selectedApi == "getWalletAddress" ? "success" : "primary"}
      >
        getWalletAddress
      </Button>
      <Button
        onClick={() => getLovelace()}
        style={selectedApi == "getLovelace" ? "success" : "primary"}
      >
        getLovelace
      </Button>
      <Button
        onClick={() => getAssets()}
        style={selectedApi == "getAssets" ? "success" : "primary"}
      >
        getAssets
      </Button>
      <div className="m-2 p-2 bg-white shadow rounded w-full">
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
      )}
    </>
  );
}
