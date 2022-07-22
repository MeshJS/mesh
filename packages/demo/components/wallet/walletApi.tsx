import { useState, useEffect } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Card, Codeblock, Input, Toggle } from "../../components";

export default function WalletApi() {
  return (
    <>
      <DemoSection
        title="Is wallet enabled"
        desc="Check if wallet is enabled."
        demoFn={Mesh.wallet.isEnabled()}
        demoStr={"Mesh.wallet.isEnabled()"}
      />

      <DemoSection
        title="Get network ID"
        desc="Get network ID. 0 is testnet, 1 is mainnet."
        demoFn={Mesh.wallet.getNetworkId()}
        demoStr={"Mesh.wallet.getNetworkId()"}
      />

      <DemoSection
        title="Get UTXOs"
        desc="Get wallet's UTXOs"
        demoFn={Mesh.wallet.getUtxos()}
        demoStr={"Mesh.wallet.getUtxos()"}
      />

      <DemoSection
        title="Get balance"
        desc="Get balance"
        demoFn={Mesh.wallet.getBalance()}
        demoStr={"Mesh.wallet.getBalance()"}
      />

      <DemoSection
        title="Get used address"
        desc="Get used address"
        demoFn={Mesh.wallet.getUsedAddresses()}
        demoStr={"Mesh.wallet.getUsedAddresses()"}
      />

      <DemoSection
        title="Get unused address"
        desc="Get unused address"
        demoFn={Mesh.wallet.getUnusedAddresses()}
        demoStr={"Mesh.wallet.getUnusedAddresses()"}
      />

      <DemoSection
        title="Get change address"
        desc="Get change address"
        demoFn={Mesh.wallet.getChangeAddress()}
        demoStr={"Mesh.wallet.getChangeAddress()"}
      />

      <DemoSection
        title="Get reward address"
        desc="Get reward address"
        demoFn={Mesh.wallet.getRewardAddresses()}
        demoStr={"Mesh.wallet.getRewardAddresses()"}
      />

      <DemoSection
        title="Get wallet address"
        desc="Get the first used address."
        demoFn={Mesh.wallet.getWalletAddress()}
        demoStr={"Mesh.wallet.getWalletAddress()"}
      />

      <DemoSection
        title="Get lovelace amount"
        desc="Get lovelace amount"
        demoFn={Mesh.wallet.getLovelace()}
        demoStr={"Mesh.wallet.getLovelace()"}
      />

      <DemoAssetParams />
    </>
  );
}

function DemoSection({ title, desc, demoFn, demoStr }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    let results = await demoFn;
    setResponse(results);
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>

        <div className="mt-8">
          <Codeblock data={`const result = await ${demoStr};`} isJson={false} />
          <Button
            onClick={() => runDemo()}
            style={
              loading ? "warning" : response !== null ? "success" : "light"
            }
            disabled={loading}
          >
            Run code snippet
          </Button>
          {response !== null && (
            <>
              <p>
                <b>Console:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function DemoAssetParams() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<null | any>(null);
  const [policyId, setPolicyId] = useState("");
  const [includeOnchain, setIncludeOnchain] = useState(false);
  const [limit, setLimit] = useState<string>("9");

  async function runDemo() {
    setLoading(true);
    await Mesh.blockfrost.init({
      blockfrostApiKey:
        (await Mesh.wallet.getNetworkId()) === 1
          ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
          : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      network: await Mesh.wallet.getNetworkId(),
    });

    let params = {
      policyId: policyId,
      includeOnchain: includeOnchain,
    };
    if (limit) {
      let _limit = parseInt(limit);
      if (_limit > 0) {
        params["limit"] = _limit;
      }
    }

    const res = await Mesh.wallet.getAssets(params);
    setResponse(res);
    setLoading(false);
  }

  let hasParams = false;
  let codeSnippet = ``;
  if (policyId) {
    hasParams = true;
    codeSnippet += policyId && `  policyId: "${policyId}",\n`;
  }
  if (includeOnchain) {
    hasParams = true;
    codeSnippet += `  includeOnchain: ${includeOnchain},\n`;
  }
  if (limit) {
    let _limit = parseInt(limit);
    if (_limit > 0) {
      hasParams = true;
      codeSnippet += `  limit: ${limit},\n`;
    }
  }
  if (hasParams) {
    codeSnippet = `const result = await Mesh.wallet.getAssets({\n${codeSnippet}});`;
  } else {
    codeSnippet = `const result = await Mesh.wallet.getAssets();`;
  }

  if (includeOnchain) {
    codeSnippet =
      `await Mesh.blockfrost.init({\n  blockfrostApiKey: "BLOCKFROST_API_KEY",\n  network: 0,\n});\n\n` +
      codeSnippet;
  }

  let hasParams = false;
  let codeSnippet = ``;
  if (policyId) {
    hasParams = true;
    codeSnippet += policyId && `  policyId: "${policyId}",\n`;
  }
  if (includeOnchain) {
    hasParams = true;
    codeSnippet += `  includeOnchain: ${includeOnchain},\n`;
  }
  if (limit) {
    let _limit = parseInt(limit);
    if (_limit > 0) {
      hasParams = true;
      codeSnippet += `  limit: ${limit},\n`;
    }
  }
  if (hasParams) {
    codeSnippet = `const result = await Mesh.wallet.getAssets({\n${codeSnippet}});`;
  } else {
    codeSnippet = `const result = await Mesh.wallet.getAssets();`;
  }

  if (includeOnchain) {
    codeSnippet =
      `await Mesh.blockfrost.init({\n  blockfrostApiKey: "BLOCKFROST_API_KEY",\n  network: await Mesh.wallet.getNetworkId(),\n});\n\n` +
      codeSnippet;
  }

  useEffect(() => {
    async function init() {
      let network = await Mesh.wallet.getNetworkId();
      setNetwork(network);
    }
    init();
  }, []);

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get assets</h3>
          <p>
            Get assets, filtered by policy ID and query on-chain information.
          </p>
        </div>

        <div className="mt-8">
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Policy ID</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={policyId}
                    onChange={(e) => setPolicyId(e.target.value)}
                    placeholder="policyId"
                  />
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 w-1/4">
                  Include on-chain information
                </td>
                <td className="py-4 px-4 w-3/4">
                  <Toggle value={includeOnchain} onChange={setIncludeOnchain} />
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 w-1/4">Limit</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="limit"
                    type="number"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <Codeblock data={codeSnippet} isJson={false} />

          <Button
            onClick={() => runDemo()}
            style={
              loading ? "warning" : response !== null ? "success" : "light"
            }
            disabled={loading}
          >
            Run code snippet
          </Button>
          {response !== null && (
            <>
              <p>
                <b>Console:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
