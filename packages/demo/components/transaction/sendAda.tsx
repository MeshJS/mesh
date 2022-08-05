import { useState, useEffect } from 'react';
import { TransactionService } from '@martifylabs/mesh';
import { Button, Card, Codeblock, Input } from '../../components';
import { TrashIcon, PlusCircleIcon } from '@heroicons/react/solid';
import { Recipient } from '../../types';
import useWallet from '../../contexts/wallet';

export default function SendAda() {
  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>Send ADA to addresses</h3>
          <p>For each recipients, append:</p>
          <Codeblock
            data={`.sendLovelace(address: string, lovelace: string)`}
            isJson={false}
          />
          <p>
            <code>.build()</code> construct the transaction and returns a
            transaction CBOR. Behind the scene, it selects necessary inputs
            belonging to the wallet, calculate the fee for this transaction and
            return remaining assets to the change address. Use{' '}
            <code>wallet.signTx()</code> to sign transaction CBOR.
          </p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const { wallet, walletConnected, walletNameConnected } = useWallet();
  const [state, setState] = useState<number>(0);
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  function add() {
    let newRecipients = [...recipients];
    newRecipients.push({
      address: '',
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
    if (value) {
      newRecipients[index].assets[assetId] = parseInt(value);
    } else {
      newRecipients[index].assets[assetId] = 0;
    }
    setRecipients(newRecipients);
  }

  async function makeTransaction() {
    setState(1);
    try {
      const tx = new TransactionService({ walletService: wallet });
      for (const recipient of recipients) {
        tx.sendLovelace(
          recipient.address,
          recipient.assets.lovelace.toString()
        );
      }
      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
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
            (await wallet.getNetworkId()) === 1
              ? process.env.NEXT_PUBLIC_TEST_ADDRESS_MAINNET!
              : process.env.NEXT_PUBLIC_TEST_ADDRESS_TESTNET!,
          assets: {
            lovelace: 1500000,
          },
        },
      ];
      setRecipients(newRecipents);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  let codeSnippet = `const wallet = await WalletService.enable("${
    walletNameConnected ? walletNameConnected : 'eternl'
  }");`;

  codeSnippet += `\n\nconst tx = new TransactionService(wallet)`;

  for (const recipient of recipients) {
    codeSnippet += `\n  .sendLovelace(\n    "${recipient.address}",\n    "${recipient.assets.lovelace}"\n  )`;
  }

  codeSnippet += `;`;

  codeSnippet += `\n\nconst unsignedTx = await tx.build();`;
  codeSnippet += `\nconst signedTx = await wallet.signTx(unsignedTx);`;
  codeSnippet += `\nconst txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" colSpan={3} className="py-3 px-6">
              Recipients
            </th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient, i) => {
            return (
              <tr key={i}>
                <td className="py-4 px-4 w-full">
                  <p>Address:</p>
                  <Input
                    value={recipient.address}
                    onChange={(e) =>
                      updateAddress(i, 'address', e.target.value)
                    }
                    placeholder="address"
                  />
                  <p>Lovelace:</p>
                  <Input
                    value={recipient.assets.lovelace}
                    onChange={(e) => updateAsset(i, 'lovelace', e.target.value)}
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

      <Codeblock data={codeSnippet} isJson={false} />

      {walletConnected && (
        <Button
          onClick={() => makeTransaction()}
          disabled={state == 1}
          style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
        >
          Run code snippet
        </Button>
      )}
      {result && (
        <>
          <h4>Result</h4>
          <Codeblock data={result} />
        </>
      )}
    </>
  );
}
