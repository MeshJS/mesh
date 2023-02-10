import { useEffect, useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import Button from '../../../../ui/button';
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/24/solid';
import { demoAddresses } from '../../../../../configs/demo';
import { Transaction } from '@meshsdk/core';
import Select from '../../../../ui/select';

export default function SendStablecoin() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<
    { address: string; stablecoin: string; quantity: number }[]
  >([
    {
      address: demoAddresses.testnet,
      stablecoin: 'DJED',
      quantity: 10,
    },
    {
      address: 'ANOTHER ADDRESS HERE',
      stablecoin: 'iUSD',
      quantity: 15,
    },
  ]);

  useEffect(() => {
    async function init() {
      const newRecipents = [
        {
          address:
            (await wallet.getNetworkId()) === 1
              ? demoAddresses.mainnet
              : demoAddresses.testnet,
          stablecoin: 'DJED',
          quantity: 10,
        },
      ];
      setUserInput(newRecipents);
    }
    if (connected) {
      init();
    }
  }, [connected]);

  function updateField(action, index, field, value) {
    let updated = [...userInput];
    if (action == 'add') {
      updated.push({ address: '', stablecoin: 'DJED', quantity: 1 });
    } else if (action == 'update') {
      updated[index][field] = value;
    } else if (action == 'remove') {
      updated.splice(index, 1);
    }
    setUserInput(updated);
  }

  return (
    <SectionTwoCol
      sidebarTo="sendStablecoin"
      header="Send Stable Coins to Addresses"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField })}
    />
  );
}

function Left({ userInput }) {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet })\n`;
  for (const recipient of userInput) {
    codeSnippet += `  .sendStablecoin(\n`;
    codeSnippet += `    '${recipient.address}', \n`;
    codeSnippet += `    '${recipient.stablecoin}', \n`;
    codeSnippet += `    '${recipient.quantity}'\n`;
    codeSnippet += `  )\n`;
  }
  codeSnippet += `;\n\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <p>
        We can chain <code>sendStablecoin()</code> to send to multiple
        recipients. For each recipients, append:
      </p>
      <Codeblock
        data={`tx.sendStablecoin(recipient: Recipient, ticker: Stablecoin, amount: string,);`}
        isJson={false}
      />
      <p>
        Like <code>sendLovelace()</code>, we can chain{' '}
        <code>sendStablecoin()</code> along side <code>tx.sendAssets()</code> to
        send multiple assets to multiple recipients.
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ userInput, updateField }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setState(1);
    setResponse(null);
    setResponseError(null);

    try {
      const tx = new Transaction({ initiator: wallet });

      for (const recipient of userInput) {
        tx.sendStablecoin(
          recipient.address,
          recipient.stablecoin,
          recipient.quantity.toString()
        );
      }

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
      console.error(error)
      setResponseError(JSON.stringify(error));
      setState(0);
    }
  }

  return (
    <Card>
      <InputTable userInput={userInput} updateField={updateField} />
      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={runDemo}
            loading={state == 1}
            response={response}
          />
          <RunDemoResult response={response} />
        </>
      ) : (
        <ConnectCipWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}

function InputTable({ userInput, updateField }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Send stable coins to recipients
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Add or remove recipients, input the address and the amount stable
            coins to send.
          </p>
        </caption>
        <thead className="thead">
          <tr>
            <th scope="col" className="py-3">
              Recipients
            </th>
          </tr>
        </thead>
        <tbody>
          {userInput.map((row, i) => {
            return (
              <tr
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                key={i}
              >
                <td>
                  <div className="flex">
                    <div className="flex-1 items-center pt-2">
                      Recipient #{i + 1}
                    </div>
                    <div className="flex-none">
                      <Button
                        onClick={() => updateField('remove', i)}
                        style="error"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    value={row.address}
                    onChange={(e) =>
                      updateField('update', i, 'address', e.target.value)
                    }
                    placeholder="Address"
                    label="Address"
                  />

                  <Select
                    id="resolveSlotNoNetwork"
                    options={{
                      DJED: 'DJED',
                      iUSD: 'iUSD',
                    }}
                    value={row.stablecoin}
                    onChange={(e) =>
                      updateField('update', i, 'stablecoin', e.target.value)
                    }
                    label="Select network"
                  />

                  <Input
                    value={row.quantity}
                    type="number"
                    onChange={(e) =>
                      updateField('update', i, 'quantity', e.target.value)
                    }
                    placeholder="Amount in Lovelace"
                    label="Quantity"
                  />
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2}>
              <Button onClick={() => updateField('add')}>
                <PlusCircleIcon className="m-0 mr-2 w-4 h-4" />
                Add recipient
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
