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
import {
  Transaction,
  ForgeScript,
  AssetMetadata,
  NativeScript,
  Mint,
  resolvePaymentKeyHash,
  resolveNativeScriptHash,
} from '@meshsdk/core';
import Textarea from '../../../../ui/textarea';
import Link from 'next/link';

const defaultMetadata = {
  name: 'Mesh Token',
  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
  mediaType: 'image/jpg',
  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
};

export default function MintingNativeScript() {
  const { wallet, connected } = useWallet();

  const [slot, setSlot] = useState<string>('99999999');

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
    if (connected) {
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
      if (
        field == 'metadata' ||
        field == 'assetName' ||
        field == 'address' ||
        field == 'assetLabel' ||
        field == 'quantity'
      ) {
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
    if (connected) {
      init();
    }
  }, [connected]);

  return (
    <SectionTwoCol
      sidebarTo="mintingNativeScript"
      header="Minting Assets with Native Script"
      leftFn={Left({ userInput, slot })}
      rightFn={Right({ userInput, updateField, slot, setSlot })}
    />
  );
}

function Left({ userInput, slot }) {
  let codeSnippet = `import { Transaction, ForgeScript, Mint, AssetMetadata, resolvePaymentKeyHash } from '@meshsdk/core';\n\n`;

  codeSnippet += `// prepare forgingScript\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n\n`;

  codeSnippet += `const keyHash = resolvePaymentKeyHash(address);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const nativeScript: NativeScript = {\n`;
  codeSnippet += `  type: 'all',\n`;
  codeSnippet += `  scripts: [\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: 'before',\n`;
  codeSnippet += `      slot: '${slot}',\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `    {\n`;
  codeSnippet += `      type: 'sig',\n`;
  codeSnippet += `      keyHash: keyHash,\n`;
  codeSnippet += `    },\n`;
  codeSnippet += `  ],\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `const forgingScript = ForgeScript.fromNativeScript(nativeScript);\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n\n`;

  let counter = 1;
  for (const recipient of userInput) {
    let _metadata = JSON.stringify(
      { error: 'Not a valid javascript object' },
      null,
      2
    );
    try {
      _metadata = JSON.stringify(JSON.parse(recipient.metadata), null, 2);
    } catch (error) {}
    codeSnippet += `// define asset#${counter} metadata\n`;
    codeSnippet += `const assetMetadata${counter}: AssetMetadata = ${_metadata};\n`;
    codeSnippet += `const asset${counter}: Mint = {\n`;
    codeSnippet += `  assetName: '${recipient.assetName}',\n`;
    codeSnippet += `  assetQuantity: '${recipient.quantity}',\n`;
    codeSnippet += `  metadata: assetMetadata${counter},\n`;
    codeSnippet += `  label: '${recipient.assetLabel}',\n`;
    codeSnippet += `  recipient: '${recipient.address}',\n`;
    codeSnippet += `};\n`;
    codeSnippet += `tx.mintAsset(\n`;
    codeSnippet += `  forgingScript,\n`;
    codeSnippet += `  asset${counter},\n`;
    codeSnippet += `);\n\n`;
    counter++;
  }

  codeSnippet += `tx.setTimeToExpire('${slot}');\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeSnippetNative = ``;
  codeSnippetNative += `import type { NativeScript } from '@meshsdk/core';\n`;
  codeSnippetNative += `\n`;
  codeSnippetNative += `const nativeScript: NativeScript = {\n`;
  codeSnippetNative += `  type: 'all',\n`;
  codeSnippetNative += `  scripts:\n`;
  codeSnippetNative += `  [\n`;
  codeSnippetNative += `    {\n`;
  codeSnippetNative += `      type: 'before',\n`;
  codeSnippetNative += `      slot: '<insert slot here>'\n`;
  codeSnippetNative += `    },\n`;
  codeSnippetNative += `    {\n`;
  codeSnippetNative += `      type: 'sig',\n`;
  codeSnippetNative += `      keyHash: '<insert keyHash here>'\n`;
  codeSnippetNative += `    }\n`;
  codeSnippetNative += `  ]\n`;
  codeSnippetNative += `};\n`;
  codeSnippetNative += `\n`;
  codeSnippetNative += `const forgingScript = ForgeScript.fromNativeScript(nativeScript);\n`;

  return (
    <>
      <p>
        Additionally, you can define the forging script with{' '}
        <code>NativeScript</code>. For example if you want to have a policy
        locking script, you can create a new <code>ForgeScript</code> with{' '}
        <code>NativeScript</code>:
      </p>
      <Codeblock data={codeSnippetNative} isJson={false} />
      <p>
        To get the <code>keyHash</code>, use the{' '}
        <code>resolvePaymentKeyHash()</code>. To get the slot, use the{' '}
        <code>resolveSlotNo()</code>. Check out{' '}
        <Link href="/apis/resolvers">Resolvers</Link> on how to use these
        functions.
      </p>
      <p>
        Important: if you are using a policy locking script, you must define{' '}
        <code>setTimeToExpire</code> before the expiry; otherwise, you will
        catch the <code>ScriptWitnessNotValidatingUTXOW</code> error. See{' '}
        <Link href="/apis/transaction#setTimeLimit">
          Transaction - setTimeLimit
        </Link>
        .
      </p>
      <p>
        You can get the policy ID for this Native Script with{' '}
        <code>resolveNativeScriptHash</code>:
      </p>

      <Codeblock
        data={`const policyId = resolveNativeScriptHash(nativeScript);`}
        isJson={false}
      />

      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ userInput, updateField, slot, setSlot }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setState(1);
    setResponse(null);
    setResponseError(null);

    try {
      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      const keyHash = resolvePaymentKeyHash(address);

      const nativeScript: NativeScript = {
        type: 'all',
        scripts: [
          {
            type: 'before',
            slot: slot,
          },
          {
            type: 'sig',
            keyHash: keyHash,
          },
        ],
      };

      const forgingScript = ForgeScript.fromNativeScript(nativeScript);

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

        tx.mintAsset(forgingScript, asset);
      }

      tx.setTimeToExpire(slot);

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
      <InputTable
        userInput={userInput}
        updateField={updateField}
        slot={slot}
        setSlot={setSlot}
      />
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

function InputTable({ userInput, updateField, slot, setSlot }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Mint assets Native Script
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
          <tr>
            <td colSpan={3}>
              <Input
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                placeholder="Slot"
                label="Slot"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
