import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useState } from 'react';
import Button from '../../ui/button';
import Card from '../../ui/card';
import Codeblock from '../../ui/codeblock';

export default function FeatureTransaction() {
  const [sendLovelace, setsendLovelace] = useState<boolean>(true);
  const [sendAssets, setsendAssets] = useState<boolean>(true);
  const [mintAsset, setmintAsset] = useState<boolean>(false);
  const [script, setscript] = useState<boolean>(false);
  const [setTimeToStart, setsetTimeToStart] = useState<boolean>(false);
  const [setTimeToExpire, setsetTimeToExpire] = useState<boolean>(false);

  let code = '';
  code += `import { Transaction } from 'meshjs';\n\n`;
  code += `const tx = new Transaction({ initiator: wallet })\n`;
  if (sendLovelace) {
    code += `  // see /apis/transaction/basic\n`;
    code += `  .sendLovelace(\n`;
    code += `    'addr_test1vpvx0sac...dh64kv0c7e4cxr',\n`;
    code += `    '1000000'\n`;
    code += `  )\n`;
  }
  if (sendAssets) {
    code += `  // see /apis/transaction/basic\n`;
    code += `  .sendAssets(\n`;
    code += `    'addr_test1vpvx0sac...dh64kv0c7e4cxr',\n`;
    code += `    [\n`;
    code += `      {\n`;
    code += `        unit: '64af286e2ad0df4de2e7de15f...6f6b656e',\n`;
    code += `        quantity: '1',\n`;
    code += `      },\n`;
    code += `    ]\n`;
    code += `  )\n`;
  }
  if (mintAsset) {
    code += `  // see /apis/transaction/minting\n`;
    code += `  .mintAsset(\n`;
    code += `    forgingScript,\n`;
    code += `    asset,\n`;
    code += `  )\n`;
  }
  if (script) {
    code += `  // see /apis/transaction/smart-contract\n`;
    code += `  .sendAssets(\n`;
    code += `    {\n`;
    code += `      address: scriptAddress,\n`;
    code += `      datum: {\n`;
    code += `        value: 'supersecret',\n`;
    code += `      },\n`;
    code += `    },\n`;
    code += `    [\n`;
    code += `      {\n`;
    code += `        unit: "64af286e2ad0df4de2e7de15f...6f6b656e",\n`;
    code += `        quantity: "1",\n`;
    code += `      },\n`;
    code += `    ],\n`;
    code += `  )\n`;
  }
  if (setTimeToStart) {
    code += `  // see /apis/transaction/basic\n`;
    code += `  .setTimeToStart(slot)\n`;
  }
  if (setTimeToExpire) {
    code += `  // see /apis/transaction/basic\n`;
    code += `  .setTimeToExpire(slot)\n`;
  }
  code += `;\n\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Chainable Transaction Builder
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Mesh enables the creation of complex transactions. You can send ADA
            and NFTS to multiple addresses, lock and unlock from smart
            contracts, all with a single transaction.
          </p>
          <Link href="/apis/transaction">
            <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
              Learn to build transactions
              <ChevronRightIcon className="ml-2 -mr-1 w-5 h-5" />
            </div>
          </Link>
        </div>
        <Card>
          <Button
            onClick={() => setsendLovelace(!sendLovelace)}
            style={sendLovelace ? 'success' : 'primary'}
          >
            Send Lovelace
          </Button>
          <Button
            onClick={() => setsendAssets(!sendAssets)}
            style={sendAssets ? 'success' : 'primary'}
          >
            Send Asset
          </Button>
          <Button
            onClick={() => setmintAsset(!mintAsset)}
            style={mintAsset ? 'success' : 'primary'}
          >
            Mint Asset
          </Button>
          <Button
            onClick={() => setscript(!script)}
            style={script ? 'success' : 'primary'}
          >
            Lock in Smart Contract
          </Button>
          <Button
            onClick={() => setsetTimeToStart(!setTimeToStart)}
            style={setTimeToStart ? 'success' : 'primary'}
          >
            Set Time to Start
          </Button>
          <Button
            onClick={() => setsetTimeToExpire(!setTimeToExpire)}
            style={setTimeToExpire ? 'success' : 'primary'}
          >
            Set Time to Expire
          </Button>
          <Codeblock data={code} isJson={false} />
        </Card>
      </div>
    </section>
  );
}
