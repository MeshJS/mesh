import { useState, useEffect } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Card, Codeblock, Input } from "../../components";
import { TrashIcon, PlusCircleIcon } from "@heroicons/react/solid";
import { Recipient } from "../../types";

export default function SendAda() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Send some ADA to another addresses</h3>
          <p>Creating a transaction requires various steps:</p>
          <ol>
            <li>
              Build the transaction
              <ol>
                <li>Get the protocol parameters</li>
                <li>Define transaction builder config</li>
                <li>Add input UTXOs</li>
                <li>Add outputs</li>
                <li>Add change address</li>
                <li>Build transaction</li>
              </ol>
            </li>
            <li>Sign the transaction</li>
            <li>Submit the transaction</li>
          </ol>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const [state, setState] = useState<number>(0);
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  function add() {
    let newRecipients = [...recipients];
    newRecipients.push({
      address: "",
      assets: {
        lovelace: 1000000,
      },
    });
    setRecipients(newRecipients);
  }

  function remove(index) {
    let newRecipients = [...recipients];
    newRecipients.splice(index, 1);
    setRecipients(newRecipients);
  }

  function updateAddress(index, field, value) {
    let newRecipients = [...recipients];
    newRecipients[index][field] = value;
    setRecipients(newRecipients);
  }

  function updateAsset(index, assetId, value) {
    let newRecipients = [...recipients];
    newRecipients[index].assets[assetId] = parseInt(value);
    setRecipients(newRecipients);
  }

  async function makeTransaction() {
    setState(1);

    try {
      const tx = await Mesh.transaction.build({
        outputs: recipients,
        blockfrostApiKey:
          (await Mesh.wallet.getNetworkId()) === 1
            ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
            : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
        network: await Mesh.wallet.getNetworkId(),
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

  useEffect(() => {
    async function init() {
      const newRecipents = [
        {
          address:
            (await Mesh.wallet.getNetworkId()) === 1
              ? process.env.NEXT_PUBLIC_TEST_ADDRESS_MAINNET!
              : process.env.NEXT_PUBLIC_TEST_ADDRESS_TESTNET!,
          assets: {
            lovelace: 1500000,
          },
        },
      ];
      setRecipients(newRecipents);
    }
    init();
  }, []);

  return (
    <>
      <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className="py-3 px-6">
              Address
            </th>
            <th scope="col" className="py-3 px-6">
              Lovelace
            </th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient, i) => {
            return (
              <tr key={i}>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={recipient.address}
                    onChange={(e) =>
                      updateAddress(i, "address", e.target.value)
                    }
                    placeholder="address"
                  />
                </td>
                <td className="py-4 px-4 w-1/4">
                  <Input
                    value={recipient.assets.lovelace}
                    onChange={(e) => updateAsset(i, "lovelace", e.target.value)}
                    placeholder="lovelace"
                    type="number"
                  />
                </td>
                <td className="py-4 px-4">
                  <Button
                    onClick={() => remove(i)}
                    style="error"
                    disabled={state == 1}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="py-4 px-4" colSpan={3}>
              <Button
                onClick={() => add()}
                style="primary"
                className="block w-full"
                disabled={state == 1}
              >
                <PlusCircleIcon className="m-0 mr-2 w-6 h-6" />
                <span>Add recipient</span>
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <Codeblock
        data={`const recipients = ${JSON.stringify(recipients, null, 2)}}

const tx = await Mesh.transaction.build({
  outputs: recipients,
  blockfrostApiKey: "BLOCKFROST_API_KEY",
  network: await Mesh.wallet.getNetworkId(),
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
    </>
  );
}
