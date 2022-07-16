import { useState } from "react";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock } from "../../components";

export default function SendAda() {
  const [state, setState] = useState(0);
  const [transactionTx, setTransactionTx] = useState<null | string>(null);
  const [transactionSignature, setTransactionSignature] = useState<
    null | string
  >(null);
  const [transactionHash, setTransactionHash] = useState<null | string>(null);

  const [recipients, setRecipients] = useState([
    {
      address:
        "addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt",
      assets: {
        lovelace: 1500000,
      },
    },
  ]);

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
    newRecipients[index].assets[assetId] = value;
    setRecipients(newRecipients);
  }

  async function makeSimpleTransaction() {
    if (process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY === undefined) {
      throw "Need blockfrost API key";
    }

    setState(1);

    const tx = await Mesh.transaction.new({
      outputs: recipients,
      blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY,
      network: 0,
    });
    setTransactionTx(tx);

    const signature = await Mesh.wallet.signTx({ tx });
    setTransactionSignature(signature);

    const txHash = await Mesh.wallet.submitTransaction({
      tx: tx,
      witnesses: [signature],
    });
    setTransactionHash(txHash);

    setState(2);
  }

  return (
    <>
      <h2>Send some ADA to another address</h2>
      <div className="m-2 p-2 bg-white shadow rounded w-full">
        {recipients.map((recipient, i) => {
          return (
            <div className="flex flex-row justify-between items-center" key={i}>
              <input
                className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
                value={recipient.address}
                onChange={(e) => updateAddress(i, "address", e.target.value)}
                type="text"
                placeholder="address"
              />
              <input
                className="bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
                value={recipient.assets.lovelace}
                onChange={(e) => updateAsset(i, "lovelace", e.target.value)}
                type="text"
                placeholder="lovelace"
              />
              <Button
                onClick={() => remove(i)}
                style="error"
                disabled={state == 1}
              >
                delete
              </Button>
            </div>
          );
        })}
        <div className="flex flex-row justify-between items-center">
          <Button onClick={() => add()} style="info" disabled={state == 1}>
            add another recipient
          </Button>
          <Button
            onClick={() => makeSimpleTransaction()}
            disabled={state == 1}
            style={state == 1 ? "warning" : state == 2 ? "success" : "primary"}
          >
            makeSimpleTransaction
          </Button>
        </div>

        {state != 0 && recipients && (
          <>
            <h4>Recipients</h4>
            <Codeblock data={recipients} />
          </>
        )}
        {transactionTx && (
          <>
            <h4>Transaction</h4>
            <Codeblock data={transactionTx} />
          </>
        )}
        {transactionSignature && (
          <>
            <h4>Signature</h4>
            <Codeblock data={transactionSignature} />
          </>
        )}
        {transactionHash && (
          <>
            <h4>Transaction Hash</h4>
            <Codeblock data={transactionHash} />
          </>
        )}
      </div>
    </>
  );
}
