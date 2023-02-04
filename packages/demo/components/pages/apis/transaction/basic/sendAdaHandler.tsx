import { useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import { KoiosProvider, Transaction } from '@meshsdk/core';
import Link from 'next/link';

export default function SendAdaHandler() {
  const [userInput, setUserInput] = useState<
    { address: string; assets: { lovelace: number } }[]
  >([
    {
      address: 'jingles',
      assets: {
        lovelace: 1000000,
      },
    },
  ]);

  function updateField(action, index, field, value) {
    let updated = [...userInput];
    if (action == 'add') {
      updated.push({ address: '', assets: { lovelace: 1000000 } });
    } else if (action == 'update') {
      if (field == 'address') {
        updated[index].address = value;
      } else if (field == 'lovelace') {
        if (value >= 1000000) {
          updated[index].assets.lovelace = value;
        }
      }
    } else if (action == 'remove') {
      updated.splice(index, 1);
    }
    setUserInput(updated);
  }

  return (
    <SectionTwoCol
      sidebarTo="sendAdaHandler"
      header="Send Assets to Handler"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField })}
    />
  );
}

function Left({ userInput }) {
  let code2 = `import { KoiosProvider, Transaction } from '@meshsdk/core';\n\n`;
  code2 += `const koios = new KoiosProvider('api');\n`;
  code2 += `\n`;
  code2 += `const tx = new Transaction({ initiator: wallet })\n`;
  code2 += `  .sendLovelace(\n`;
  code2 += `    await koios.fetchHandleAddress('${userInput[0].address}'),\n`;
  code2 += `    '${userInput[0].assets.lovelace}'\n`;
  code2 += `);\n\n`;
  code2 += `const unsignedTx = await tx.build();\n`;
  code2 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code2 += `const txHash = await wallet.submitTx(signedTx);\n`;

  let code1 = `import { KoiosProvider } from '@meshsdk/core';\n\n`;
  code1 += `const koios = new KoiosProvider('api');\n`;
  code1 += `const address = await koios.fetchHandleAddress('${userInput[0].address}');`;

  return (
    <>
      <p>
        We can get the{' '}
        <a href="https://adahandle.com/" target="_blank" rel="noreferrer">
          ADA Handle
        </a>
        's address with{' '}
        <code>fetchHandleAddress()</code>:
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Next, we can create a transactions, for instance, lets send some
        lovelace to {userInput[0].address}:
      </p>
      <Codeblock data={code2} isJson={false} />
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
    setResponseError(null);

    try {
      const koiosProvider = new KoiosProvider('api');

      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(
        await koiosProvider.fetchHandleAddress(userInput[0].address),
        userInput[0].assets.lovelace.toString()
      );
      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
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
          Send ADA to handler
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Note: this demo only works on mainnet.
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
                  <Input
                    value={row.address}
                    onChange={(e) =>
                      updateField('update', i, 'address', e.target.value)
                    }
                    placeholder="Handler"
                    label="Handler"
                  />
                  <Input
                    value={row.assets.lovelace}
                    type="number"
                    onChange={(e) =>
                      updateField('update', i, 'lovelace', e.target.value)
                    }
                    placeholder="Amount in Lovelace"
                    label="Amount in Lovelace"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
