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
import { Transaction, ForgeScript, AssetMetadata } from '@meshsdk/core';
import type { Mint } from '@meshsdk/core';
import Textarea from '../../../ui/textarea';
import Link from 'next/link';

const defaultMetadata = {
  name: 'Mesh Token',
  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
  mediaType: 'image/jpg',
  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
};

export default function Minting() {
  const { wallet, connected } = useWallet();

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
      sidebarTo="minting"
      header="Minting Assets"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField })}
    />
  );
}

function Left({ userInput }) {
  let codeSnippet = `import { Transaction, ForgeScript } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Mint, AssetMetadata } from '@meshsdk/core';\n\n`;

  codeSnippet += `// prepare forgingScript\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(address);\n\n`;

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

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeSnippet1 = `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);`;

  let codeSnippet2 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    defaultMetadata,
    null,
    2
  )};\n`;
  codeSnippet2 += `const asset: Mint = {\n`;
  codeSnippet2 += `  assetName: 'MeshToken',\n`;
  codeSnippet2 += `  assetQuantity: '1',\n`;
  codeSnippet2 += `  metadata: assetMetadata,\n`;
  codeSnippet2 += `  label: '721',\n`;
  codeSnippet2 += `  recipient: '${demoAddresses.testnet}' \n`;
  codeSnippet2 += `};\n`;
  codeSnippet2 += `tx.mintAsset(\n`;
  codeSnippet2 += `  forgingScript,\n`;
  codeSnippet2 += `  asset,\n`;
  codeSnippet2 += `);`;

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
        In this section, we will see how to mint native assets with a{' '}
        <code>ForgeScript</code>. For minting assets with smart contract, visit{' '}
        <Link href="/apis/transaction/smart-contract#plutusminting">
          Transaction - Smart Contract - Minting Assets with Smart Contract
        </Link>
        .
      </p>
      <p>
        Firstly, we need to define the <code>forgingScript</code> with{' '}
        <code>ForgeScript</code>. We use the first wallet address as the
        "minting address" (you can use other addresses).
      </p>
      <Codeblock data={codeSnippet1} isJson={false} />
      <p>Then, we define the metadata.</p>
      <Codeblock data={codeSnippet2} isJson={false} />
      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        Additionally, you can define the forging script with{' '}
        <code>NativeScript</code>. For example if you want to have a policy
        locking script, you can do this:
      </p>
      <Codeblock data={codeSnippetNative} isJson={false} />
      <p>
        To get the <code>keyHash</code>, use the{' '}
        <code>resolvePaymentKeyHash()</code>. To get the slot, use the{' '}
        <code>resolveSlotNo()</code>. See{' '}
        <Link href="/apis/resolvers">Resolvers</Link>.
      </p>
      <p>
        Note: If you were expecting a particular Policy ID but received an
        entirely different one, try switching the order
        of the objects inside the <code>scripts</code> as the order of the
        objects matters and must match the order used before.
      </p>
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
      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      const forgingScript = ForgeScript.withOneSignature(address);

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
