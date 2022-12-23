import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';
import { Transaction, ForgeScript } from '@meshsdk/core';
import type { Asset, AssetExtended } from '@meshsdk/core';

export default function Burning() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<{}>({
    '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e': 1,
  });
  const [walletAssets, setWalletAssets] = useState<AssetExtended[]>([
    {
      unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',
      policyId: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a42',
      assetName: 'MeshToken',
      fingerprint: 'asset1vy4dlqfc42r49jtvz5v4ek3s7wz96s0azur5xx',
      quantity: '10',
    },
    {
      unit: '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c964354657374746f6b656e',
      policyId: '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c9643',
      assetName: 'MeshToken',
      fingerprint: 'asset1mdkjgeufm9lk4yzszckq6r7t5p4vzhwz2dz90k',
      quantity: '5',
    },
  ]);

  useEffect(() => {
    async function init() {
      const _assets = await wallet.getAssets();
      setWalletAssets(_assets.slice(0, 9));
    }
    if (connected) {
      init();
    }
  }, [connected]);

  function updateField(action, unit, value) {
    let updated = { ...userInput };
    if (action == 'update') {
      if (value <= 0) {
        delete updated[unit];
      } else {
        const thisAsset = walletAssets.find((asset) => {
          return asset.unit == unit;
        });
        if (thisAsset) {
          if (value <= parseInt(thisAsset.quantity)) {
            updated[unit] = value;
          }
        }
      }
      setUserInput(updated);
    }
  }

  return (
    <SectionTwoCol
      sidebarTo="burning"
      header="Burning Assets"
      leftFn={Left({ userInput })}
      rightFn={Right({ userInput, updateField, walletAssets })}
    />
  );
}

function Left({ userInput }) {
  let codeSnippet = `import { Transaction, ForgeScript } from '@meshsdk/core';\n`;
  codeSnippet += `import type { Asset } from '@meshsdk/core';\n\n`;

  codeSnippet += `// prepare forgingScript\n`;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(address);\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n\n`;

  let counter = 1;
  for (const unit in userInput) {
    codeSnippet += `// burn asset#${counter}\n`;
    codeSnippet += `const asset${counter}: Asset = {\n`;
    codeSnippet += `  unit: '${unit}',\n`;
    codeSnippet += `  quantity: '${userInput[unit]}',\n`;
    codeSnippet += `};\n`;
    codeSnippet += `tx.burnAsset(forgingScript, asset${counter});\n\n`;
    counter++;
  }

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeSnippet1 = `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);`;

  let codeSnippet2 = `const asset: Asset = {\n`;
  codeSnippet2 += `  unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',\n`;
  codeSnippet2 += `  quantity: '1',\n`;
  codeSnippet2 += `};\n`;
  codeSnippet2 += `tx.burnAsset(forgingScript, asset);`;

  return (
    <>
      <p>
        Like minting assets, we need to define the <code>forgingScript</code>{' '}
        with <code>ForgeScript</code>. We use the first wallet address as the
        "minting address". Note that, assets can only be burned by its minting
        address.
      </p>
      <Codeblock data={codeSnippet1} isJson={false} />
      <p>
        Then, we define <code>Asset</code> and set <code>tx.burnAsset()</code>
      </p>
      <Codeblock data={codeSnippet2} isJson={false} />
      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ userInput, updateField, walletAssets }) {
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

      for (const unit in userInput) {
        const asset: Asset = {
          unit: unit,
          quantity: userInput[unit],
        };
        tx.burnAsset(forgingScript, asset);
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
      <InputTable
        userInput={userInput}
        updateField={updateField}
        walletAssets={walletAssets}
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

function InputTable({ userInput, updateField, walletAssets }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Select assets to burn
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Select the assets and input the quantity you wish to burn. Note this
            demo we only selects up to 9 random assets.
          </p>
        </caption>
        <thead className="thead">
          <tr>
            <th scope="col" className="py-3">
              Assets
            </th>
            <th scope="col" className="py-3">
              Quantity to burn
            </th>
          </tr>
        </thead>
        <tbody>
          {walletAssets.map((asset, i) => {
            return (
              <tr
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                key={i}
              >
                <td>
                  <Input
                    value={asset.assetName}
                    onChange={(e) => {}}
                    placeholder="Unit"
                    label="Unit"
                  />
                </td>
                <td>
                  <Input
                    value={userInput[asset.unit] ? userInput[asset.unit] : 0}
                    type="number"
                    onChange={(e) =>
                      updateField('update', asset.unit, e.target.value)
                    }
                    placeholder="Quantity to burn"
                    label="Quantity to burn"
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
