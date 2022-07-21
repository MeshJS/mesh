import { useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Card, Codeblock, Input } from "../../components";
import { TrashIcon, PlusCircleIcon } from "@heroicons/react/solid";

export default function SendMultiassets() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Send multi-assets to another addresses</h3>
          <p>Creating a transaction to send native assets.</p>
        </div>
        <div className="mt-8"></div>
      </div>
      <CodeDemo />
    </Card>
  );
}

function CodeDemo() {
  const [state, setState] = useState(0);
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState<
    { address: string; assets: { lovelace?: number } }[]
  >([
    {
      address:
        "addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt",
      assets: {},
    },
  ]);
  const [assets, setAssets] = useState<null | any>(null);
  const [lovelace, setLovelace] = useState<string>("");
  const [selectedAssets, setSelectedAssets] = useState<{}>({});

  async function makeTransaction() {
    setState(1);

    try {
      const tx = await Mesh.transaction.new({
        outputs: recipients,
        blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!,
        network: 0,
      });

      const signature = await Mesh.wallet.signTx({ tx });

      const txHash = await Mesh.wallet.submitTransaction({
        tx: tx,
        witnesses: [signature],
      });
      setResult(txHash);

      setState(2);
    } catch (error) {
      setResult(`${error}`);
      setState(0);
    }
  }

  async function getAssets() {
    setState(1);
    await Mesh.blockfrost.init({
      blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!,
      network: 0,
    });

    const _assets = await Mesh.wallet.getAssets({
      includeOnchain: true,
      limit: 9,
    });
    setAssets(_assets);
    setState(0);
  }

  function toggleSelectedAssets(asset) {
    let updateSelectedAssets = { ...selectedAssets };
    if (asset.unit in updateSelectedAssets) {
      delete updateSelectedAssets[asset.unit];
    } else {
      updateSelectedAssets[asset.unit] = asset;
    }
    setSelectedAssets(updateSelectedAssets);

    let newRecipients = [...recipients];
    let newAssets = {};
    for (let unit in updateSelectedAssets) {
      newAssets[
        `${updateSelectedAssets[unit].policy}.${updateSelectedAssets[unit].name}`
      ] = 1;
    }
    if (lovelace) {
      newAssets["lovelace"] = parseInt(lovelace);
    }
    newRecipients[0].assets = newAssets;
    setRecipients(newRecipients);
  }

  function updateLovelace(value) {
    setLovelace(value);
    let newRecipients = [...recipients];
    if (value) {
      newRecipients[0].assets["lovelace"] = parseInt(value);
    } else {
      delete newRecipients[0].assets["lovelace"];
    }
    setRecipients(newRecipients);
  }

  function updateAddress(index, field, value) {
    let newRecipients = [...recipients];
    newRecipients[index][field] = value;
    setRecipients(newRecipients);
  }

  return (
    <>
      <div className="grid gap-4 grid-cols-2">
        <div>
          {assets == null && (
            <Button
              onClick={() => getAssets()}
              disabled={state == 1}
              style={state == 1 ? "warning" : "primary"}
            >
              Get wallet assets
            </Button>
          )}
          <AssetsContainer
            assets={assets}
            selectedAssets={selectedAssets}
            toggleSelectedAssets={toggleSelectedAssets}
          />
        </div>
        <div>
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="py-3 px-6">
                  Address
                </th>
                <th scope="col" className="py-3 px-6">
                  Lovelace
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={recipients[0].address}
                    onChange={(e) =>
                      updateAddress(0, "address", e.target.value)
                    }
                    placeholder="address"
                  />
                </td>
                <td className="py-4 px-4 w-1/4">
                  <Input
                    value={lovelace}
                    onChange={(e) => updateLovelace(e.target.value)}
                    placeholder="lovelace"
                    type="number"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <Codeblock
            data={`const recipients = ${JSON.stringify(recipients, null, 2)}}

const tx = await Mesh.transaction.new({
  outputs: recipients,
  blockfrostApiKey: "BLOCKFROST_API_KEY",
  network: 0, // 0 for testnet, 1 for mainnet
});

const signature = await Mesh.wallet.signTx({ tx });

const txHash = await Mesh.wallet.submitTransaction({
  tx: tx,
  witnesses: [signature],
});`}
            isJson={false}
          />

          <Button
            onClick={() => makeTransaction()}
            disabled={state == 1}
            style={state == 1 ? "warning" : state == 2 ? "success" : "light"}
          >
            Run code snippet
          </Button>

          {result && (
            <>
              <h4>Result</h4>
              <Codeblock data={result} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function AssetsContainer({ assets, selectedAssets, toggleSelectedAssets }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {assets &&
        assets.map((asset, i) => {
          return (
            <CardAsset
              asset={asset}
              selectedAssets={selectedAssets}
              toggleSelectedAssets={toggleSelectedAssets}
              key={i}
            />
          );
        })}
    </div>
  );
}

function CardAsset({ asset, selectedAssets, toggleSelectedAssets }) {
  let thisClass =
    asset.unit in selectedAssets
      ? "max-w-sm bg-white rounded-lg border border-green-200 shadow-md dark:bg-gray-800 dark:border-green-700 cursor-pointer"
      : "max-w-sm bg-white rounded-lg border border-gray-200 shadow-md dark:bg-gray-800 dark:border-gray-700 cursor-pointer";
  return (
    <div
      className={thisClass}
      onClick={() => {
        toggleSelectedAssets(asset);
      }}
    >
      <div className="aspect-w-3 aspect-h-2 rounded-t-lg overflow-hidden">
        {asset.image && (
          <img
            className="m-0 w-full h-full object-center object-cover"
            src={asset.image}
            alt={asset.name}
          />
        )}
      </div>
      <div className="p-5 ">
        <b>{asset.name}</b>
      </div>
    </div>
  );
}
