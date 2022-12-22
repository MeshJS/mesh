import { useEffect, useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import useWallet from '../../../../../contexts/wallet';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import Button from '../../../../ui/button';
import { PlusCircleIcon, TrashIcon } from '@heroicons/react/24/solid';
import {
  demoAddresses,
  demoPlutusMintingScript,
} from '../../../../../configs/demo';
import { Transaction, ForgeScript, AssetMetadata } from '@meshsdk/core';
import type { Mint, Action } from '@meshsdk/core';
import Textarea from '../../../../ui/textarea';
import Link from 'next/link';
import { PlutusScript } from '@meshsdk/core';

const defaultMetadata = {
  name: 'Mesh Token',
  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
  mediaType: 'image/jpg',
  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
};

export default function PlutusMinting() {
  const { wallet, walletConnected } = useWallet();

  const [userInput, setUserInput] = useState<{}[]>([
    {
      address: demoAddresses.testnet,
      assetName: 'MeshToken',
      metadata: JSON.stringify(defaultMetadata, null, 2),
      assetLabel: '721',
      quantity: 1,
    },
  ]);

  async function updateField(action, index, field, value) {
    let _address = demoAddresses.testnet;
    if (walletConnected) {
      _address =
        (await wallet.getNetworkId()) === 1
          ? demoAddresses.mainnet
          : demoAddresses.testnet;
    }

    let updated = [...userInput];
    if (action == 'add') {
      updated.push({
        address: _address,
        assetName: 'MeshToken',
        metadata: JSON.stringify(defaultMetadata, null, 2),
        assetLabel: '721',
        quantity: 1,
      });
    } else if (action == 'update') {
      if (value >= 1 || field == 'metadata' || field == 'assetName') {
        updated[index][field] = value;
      }
    } else if (action == 'remove') {
      updated.splice(index, 1);
    }
    setUserInput(updated);
  }

  useEffect(() => {
    async function init() {
      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      let updated = [
        {
          address: address,
          assetName: 'MeshToken',
          metadata: JSON.stringify(defaultMetadata, null, 2),
          assetLabel: '721',
          quantity: 1,
        },
      ];
      setUserInput(updated);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  return (
    <SectionTwoCol
      sidebarTo="plutusminting"
      header="Minting Assets with Smart Contract"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField })}
    />
  );
}

function Left({ userInput }) {
  return (
    <>
      <p></p>
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

    // try {
    const script: PlutusScript = {
      code: demoPlutusMintingScript,
      version: 'V2',
    };
    const redeemer: Partial<Action> = {
      data: { alternative: 0, fields: [] },
      tag: 'MINT',
    };

    const tx = new Transaction({ initiator: wallet });

    for (const recipient of userInput) {
      let assetMetadata: undefined | AssetMetadata = undefined;
      try {
        assetMetadata = JSON.parse(recipient.metadata);
      } catch (error) {
        setResponseError(
          'Problem parsing metadata. Must be a valid JavaScript object.'
        );
        setState(0);
      }
      if (assetMetadata == undefined) {
        return;
      }

      const asset: Mint = {
        assetName: recipient.assetName,
        assetQuantity: recipient.quantity.toString(),
        metadata: assetMetadata,
        label: recipient.assetLabel,
        recipient: recipient.address,
      };
      console.log({ script });
      console.log({ redeemer });
      console.log({ asset });
      tx.mintAsset(script, asset, redeemer); // abdel: error here
    }

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    setResponse(txHash);
    setState(2);
    // } catch (error) {
    //   setResponseError(JSON.stringify(error));
    //   setState(0);
    // }
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
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}

function InputTable({ userInput, updateField }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Mint assets and send to recipients
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Add or remove recipients, input the address and define the asset
            metadata to mint and send to recipients.
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
                      <span className="">Recipient #{i + 1}</span>
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
                    value={row.assetName}
                    onChange={(e) =>
                      updateField('update', i, 'assetName', e.target.value)
                    }
                    placeholder="Asset name"
                    label="Asset name"
                  />
                  <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                    Metadata
                  </label>
                  <Textarea
                    value={row.metadata}
                    onChange={(e) =>
                      updateField('update', i, 'metadata', e.target.value)
                    }
                    rows={8}
                  />
                  <div className="block mb-4">
                    <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Asset label
                    </label>
                    <div className="flex items-center mb-4">
                      <input
                        type="radio"
                        value="721"
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        checked={row.assetLabel === '721'}
                        onChange={(e) =>
                          updateField('update', i, 'assetLabel', '721')
                        }
                      />
                      <label
                        htmlFor="assetlabel-radio-1"
                        className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                      >
                        Non fungible asset (721)
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="radio"
                        value="20"
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        checked={row.assetLabel === '20'}
                        onChange={(e) =>
                          updateField('update', i, 'assetLabel', '20')
                        }
                      />
                      <label
                        htmlFor="assetlabel-radio-2"
                        className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                      >
                        Fungible asset (20)
                      </label>
                    </div>
                  </div>
                  <Input
                    value={row.quantity}
                    type="number"
                    onChange={(e) =>
                      updateField('update', i, 'quantity', e.target.value)
                    }
                    placeholder="Quantity"
                    label="Quantity"
                  />
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={3}>
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
