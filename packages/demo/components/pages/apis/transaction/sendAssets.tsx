import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';
import Button from '../../../ui/button';
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/24/solid';
import { demoAddresses } from '../../../../configs/demo';
import FetchSelectAssets from '../../../common/fetchSelectAssets';
import { Transaction } from '@meshsdk/core';
import type { Asset } from '@meshsdk/core';

export default function SendAssets() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<
    { address: string; assets: { [unit: string]: number } }[]
  >([
    {
      address: demoAddresses.testnet,
      assets: {
        lovelace: 1000000,
        '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e': 1,
      },
    },
    {
      address: 'ANOTHER ADDRESS HERE',
      assets: {
        lovelace: 1500000,
      },
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
          assets: {},
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
      updated.push({ address: '', assets: { lovelace: 1000000 } });
    } else if (action == 'update') {
      if (field == 'address') {
        updated[index].address = value;
      } else {
        if (value == 0) {
          delete updated[index].assets[field];
        } else {
          if (value >= 0) {
            updated[index].assets[field] = value;
          }
        }
      }
    } else if (action == 'remove') {
      updated.splice(index, 1);
    }
    setUserInput(updated);
  }

  return (
    <SectionTwoCol
      sidebarTo="sendAssets"
      header="Send Multiple Assets to Addresses"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField })}
    />
  );
}

function Left({ userInput }) {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Asset } from '@meshsdk/core';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet })`;
  for (const recipient of userInput) {
    if ('lovelace' in recipient.assets && recipient.assets.lovelace > 0) {
      codeSnippet += `\n  .sendLovelace(\n    '${recipient.address}',\n    '${recipient.assets.lovelace}'\n  )`;
    }

    let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
      return assetId != 'lovelace' && recipient.assets[assetId] > 0;
    });
    if (nativeAssets.length) {
      codeSnippet += `\n  .sendAssets(\n    '${recipient.address}',`;
      codeSnippet += `\n    [`;
      for (const asset of nativeAssets) {
        if (recipient.assets[asset] > 0) {
          codeSnippet += `\n      {`;
          codeSnippet += `\n        unit: '${asset}',`;
          codeSnippet += `\n        quantity: '1',`;
          codeSnippet += `\n      },`;
        }
      }
      codeSnippet += `\n    ]`;
      codeSnippet += `\n  )`;
    }
  }
  codeSnippet += `;\n\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeSnippet1 = `import type { Asset } from '@meshsdk/core';\n\n`;
  codeSnippet1 += `let assets: Asset[] = [];\n`;
  codeSnippet1 += `for (const asset of nativeAssets) {\n`;
  codeSnippet1 += `  let thisAsset = {\n`;
  codeSnippet1 += `    unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',\n`;
  codeSnippet1 += `    quantity: '1',\n`;
  codeSnippet1 += `  };\n`;
  codeSnippet1 += `  assets.push(thisAsset);\n`;
  codeSnippet1 += `}\n`;
  codeSnippet1 += `tx.sendAssets(recipient.address, assets);`;

  return (
    <>
      <p>
        For each recipients, we define a list of <code>Asset</code> to send:
      </p>
      <Codeblock data={codeSnippet1} isJson={false} />
      <p>
        We can chain a series of <code>tx.sendAssets()</code> and{' '}
        <code>tx.sendLovelace()</code> to send multiple assets to multiple
        recipients.
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
    setResponseError(null);

    try {
      const tx = new Transaction({ initiator: wallet });

      for (const recipient of userInput) {
        if (recipient.assets.lovelace) {
          tx.sendLovelace(
            { address: recipient.address },
            recipient.assets.lovelace.toString()
          );
        }
        let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
          return assetId != 'lovelace';
        });
        if (nativeAssets.length) {
          let assets: Asset[] = [];
          for (const asset of nativeAssets) {
            let thisAsset: Asset = {
              unit: asset,
              quantity: '1',
            };
            assets.push(thisAsset);
          }
          tx.sendAssets({ address: recipient.address }, assets);
        }
      }

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
  const { connected } = useWallet();

  function selectAsset(id, unit) {
    if (unit in userInput[id].assets) {
      updateField('update', id, unit, 0);
    } else {
      updateField('update', id, unit, 1);
    }
  }

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Send multi-assets to recipients
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Add or remove recipients, input the address and the amount ADA to
            send.
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
                  <Input
                    value={'lovelace' in row.assets ? row.assets.lovelace : 0}
                    type="number"
                    onChange={(e) =>
                      updateField('update', i, 'lovelace', e.target.value)
                    }
                    placeholder="Amount in Lovelace"
                    label="Lovelace"
                  />
                  <>
                    <FetchSelectAssets
                      index={i}
                      selectedAssets={row.assets}
                      selectAssetFn={selectAsset}
                    />
                  </>
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
