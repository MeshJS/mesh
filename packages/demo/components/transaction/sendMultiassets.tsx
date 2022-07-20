import { useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Card, Codeblock } from "../../components";
import { TrashIcon, PlusCircleIcon } from "@heroicons/react/solid";

export default function SendMultiassets() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Send multi-assets to another addresses</h3>
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
  const [state, setState] = useState(0);
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState([
    {
      address:
        "addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt",
      assets: {
        lovelace: 2500000,
        "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e2.Pixos": 3,
      },
    },
  ]);

  async function makeTransaction() {
    if (process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY === undefined) {
      throw "Need blockfrost API key";
    }

    setState(1);

    try {
      const tx = await Mesh.transaction.new({
        outputs: recipients,
        blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY,
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

  return (
    <Button
      onClick={() => makeTransaction()}
      // disabled={state == 1}
      // style={state == 1 ? "warning" : state == 2 ? "success" : "light"}
    >
      Run code snippet
    </Button>
  );
}
