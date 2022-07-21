import { useState } from "react";
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

      <DemoSection
        title="Get assets"
        desc="Get assets"
        demoFn={Mesh.wallet.getAssets()}
        demoStr={"Mesh.wallet.getAssets()"}
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
  const [policyId, setPolicyId] = useState(
    "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2"
  );
  const [includeOnchain, setIncludeOnchain] = useState(true);
  const [limit, setLimit] = useState<string>("");

  async function runDemo() {
    setLoading(true);
    await Mesh.blockfrost.init({
      blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!,
      network: 0,
    });

    let params = {
      policyId: policyId,
      includeOnchain: includeOnchain,
    };
    if (limit) {
      params["limit"] = parseInt(limit);
    }

    const res = await Mesh.wallet.getAssets(params);
    setResponse(res);
    setLoading(false);
  }

  let codeSnippet = `const result = await Mesh.wallet.getAssets({\n`;
  if (policyId) {
    codeSnippet += policyId && `  policyId: "${policyId}",\n`;
  }
  if (includeOnchain) {
    codeSnippet += `  includeOnchain: ${includeOnchain},\n`;
  }
  if (limit) {
    codeSnippet += `  limit: ${limit},\n`;
  }
  codeSnippet += `}`;

  if (includeOnchain) {
    codeSnippet =
      `await Mesh.blockfrost.init({\n  blockfrostApiKey: "BLOCKFROST_API_KEY",\n  network: 0,\n});\n\n` +
      codeSnippet;
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get assets with parameters</h3>
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
                  {/* <input
                    id="default-checkbox"
                    type="checkbox"
                    checked={includeOnchain}
                    onChange={() => setIncludeOnchain(!includeOnchain)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  /> */}
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

// function DemoAssetsPolicyId() {
//   const [response, setResponse] = useState<null | any>(null);
//   const [policyId, setPolicyId] = useState(
//     "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2"
//   );

//   async function runDemo() {
//     const res = await Mesh.wallet.getAssets({
//       policyId: policyId,
//     });
//     setResponse(res);
//   }

//   return (
//     <section className="mt-4">
//       <div className="flex gap-4">
//         <div className="flex-1">
//           <h2 className="text-2xl dark:text-white">
//             Get assets and filtered by policy ID
//           </h2>
//           <p className="font-light text-gray-500 sm:text-lg dark:text-gray-400 prose">
//             Get assets and filtered by policy ID
//           </p>
//         </div>

//         <div className="flex-1">
//           {response !== null ? (
//             <Codeblock data={response} />
//           ) : (
//             <>
//               <input
//                 className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
//                 value={policyId}
//                 onChange={(e) => setPolicyId(e.target.value)}
//                 type="text"
//                 placeholder="policy ID"
//               />
//               <Button onClick={() => runDemo()}>Try it</Button>
//             </>
//           )}
//         </div>
//       </div>
//     </section>
//   );
// }
