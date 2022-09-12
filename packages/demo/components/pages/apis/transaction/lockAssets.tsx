import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import SectionTwoCol from '../common/sectionTwoCol';
import useWallet from '../../../../contexts/wallet';
import ConnectCipWallet from '../common/connectCipWallet';
import Input from '../../../ui/input';
import Button from '../../../ui/button';
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/24/solid';
import { demoAddresses } from '../../../../configs/demo';
import { Transaction } from '@martifylabs/mesh';
import FetchSelectAssets from '../common/fetchSelectAssets';

export default function LockAssets() {
  const { wallet, walletConnected } = useWallet();
  const [userInput, setUserInput] = useState<
    { address: string; assets: { lovelace: number } }[]
  >([
    {
      address: demoAddresses.testnet,
      assets: {
        lovelace: 1000000,
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
          assets: {
            lovelace: 1000000,
          },
        },
      ];
      setUserInput(newRecipents);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  function updateField(action, index, field, value) {
    let updated = [...userInput];
    if (action == 'add') {
      updated.push({ address: '', assets: { lovelace: 1000000 } });
    } else if (action == 'update') {
      if (field == 'address') {
        updated[index].address = value;
      } else {
        updated[index].assets[field] = value;
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
  let codeSnippet = `const tx = new Transaction({ initiator: wallet })`;
  for (const recipient of userInput) {
    if ('lovelace' in recipient.assets && recipient.assets.lovelace > 0) {
      codeSnippet += `\n  .sendLovelace(\n    "${recipient.address}",\n    "${recipient.assets.lovelace}"\n  )`;
    }

    let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
      return assetId != 'lovelace';
    });
    if (nativeAssets.length) {
      codeSnippet += `\n  .sendAssets(\n    "${recipient.address}",`;
      codeSnippet += `\n    [`;
      for (const asset of nativeAssets) {
        codeSnippet += `\n      {`;
        codeSnippet += `\n        unit: "${asset}",`;
        codeSnippet += `\n        quantity: "1",`;
        codeSnippet += `\n      },`;
      }
      codeSnippet += `\n    ]`;
      codeSnippet += `\n  )`;
    }
  }
  codeSnippet += `;\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
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
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ userInput, updateField }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, walletConnected, hasAvailableWallets } = useWallet();

  async function runDemo() {
    setState(1);
    setResponseError(null);

    try {
      const tx = new Transaction({ initiator: wallet });

      for (const recipient of userInput) {
        if (recipient.assets.lovelace) {
          tx.sendLovelace(
            recipient.address,
            recipient.assets.lovelace.toString()
          );
        }
        let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
          return assetId != 'lovelace';
        });
        if (nativeAssets.length) {
          let assets: { unit: string; quantity: string }[] = [];
          for (const asset of nativeAssets) {
            let thisAsset = {
              unit: asset,
              quantity: '1',
            };
            assets.push(thisAsset);
          }
          tx.sendAssets(recipient.address, assets);
        }
      }

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
      setResponseError(`${error}`);
      setState(0);
    }
  }

  return (
    <Card>
      <InputTable userInput={userInput} updateField={updateField} />
      {hasAvailableWallets && (
        <>
          {walletConnected ? (
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
        </>
      )}
      {responseError !== null && (
        <>
          <p>
            <b>Result:</b>
          </p>
          <Codeblock data={responseError} />
        </>
      )}
    </Card>
  );
}

function InputTable({ userInput, updateField }) {
  const { walletConnected } = useWallet();

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
          Send ADA to recipients
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Add or remove recipients, input the address and the amount ADA to
            send.
          </p>
        </caption>
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className="py-3">
              Recipients
            </th>
            <th scope="col" className="py-3"></th>
          </tr>
        </thead>
        <tbody>
          {userInput.map((row, i) => {
            return (
              <tr
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                key={i}
              >
                <td className="">
                  <Input
                    value={row.address}
                    onChange={(e) =>
                      updateField('update', i, 'address', e.target.value)
                    }
                    placeholder="Address"
                    label="Address"
                  />
                  <Input
                    value={row.assets.lovelace}
                    onChange={(e) =>
                      updateField('update', i, 'lovelace', e.target.value)
                    }
                    placeholder="Amount in Lovelace"
                    label="Lovelace"
                  />
                  {walletConnected && (
                    <>
                      <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                        Select asset
                      </label>
                      <FetchSelectAssets
                        index={i}
                        selectedAssets={row.assets}
                        selectAssetFn={selectAsset}
                      />
                    </>
                  )}
                </td>
                <td className="">
                  <Button
                    onClick={() => updateField('remove', i)}
                    style="error"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
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
