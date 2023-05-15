import Link from 'next/link';
import { useState } from 'react';
import { Element } from 'react-scroll';

import Codeblock from '../../../../components/ui/codeblock';
import RunDemoButton from '../../../../components/common/runDemoButton';
import RunDemoResult from '../../../../components/common/runDemoResult';
import { loadWallet } from './functions';
import { AssetMetadata, ForgeScript, Mint, Transaction } from '@meshsdk/core';
import { demoAddresses } from '../../../../configs/demo';
import ShowMoreDetails from '../../../../components/common/showMoreDetails';

export default function MintToken() {
  const [response, setResponse] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  let codeDemo = `import { AssetMetadata, ForgeScript, Mint, Transaction } from '@meshsdk/core';\n\n`;
  codeDemo += `// see Initialize your App Wallet section to learn how to load your wallet\n\n`;
  codeDemo += `const address = wallet.getPaymentAddress();\n`;
  codeDemo += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  codeDemo += `\n`;
  codeDemo += `const assetMetadata: AssetMetadata = {\n`;
  codeDemo += `  name: 'Mesh Token',\n`;
  codeDemo += `  image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',\n`;
  codeDemo += `  mediaType: 'image/jpg',\n`;
  codeDemo += `  description: 'This NFT is minted by Mesh (https://meshjs.dev/).',\n`;
  codeDemo += `};\n`;
  codeDemo += `const asset: Mint = {\n`;
  codeDemo += `  assetName: 'MeshToken',\n`;
  codeDemo += `  assetQuantity: '1',\n`;
  codeDemo += `  metadata: assetMetadata,\n`;
  codeDemo += `  label: '721',\n`;
  codeDemo += `  recipient: demoAddresses.testnet,\n`;
  codeDemo += `};\n`;
  codeDemo += `\n`;
  codeDemo += `const tx = new Transaction({ initiator: wallet });\n`;
  codeDemo += `tx.mintAsset(forgingScript, asset);\n`;
  codeDemo += `\n`;
  codeDemo += `const unsignedTx = await tx.build();\n`;
  codeDemo += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeDemo += `const txHash = await wallet.submitTx(signedTx);\n`;
  codeDemo += `console.log(txHash);`;

  async function demoLoadWallet() {
    setLoading(true);
    setResponse(null);
    const wallet = await loadWallet();

    const address = wallet.getPaymentAddress();
    const forgingScript = ForgeScript.withOneSignature(address);

    const assetMetadata: AssetMetadata = {
      name: 'Mesh Token',
      image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
      mediaType: 'image/jpg',
      description: 'This NFT is minted by Mesh (https://meshjs.dev/).',
    };
    const asset: Mint = {
      assetName: 'MeshToken',
      assetQuantity: '1',
      metadata: assetMetadata,
      label: '721',
      recipient: demoAddresses.testnet,
    };

    const tx = new Transaction({ initiator: wallet });
    tx.mintAsset(forgingScript, asset);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    setResponse(txHash);
    setLoading(false);
  }

  return (
    <Element name="sendada">
      <h2>Mint Tokens</h2>

      {/*       
      <Codeblock data={codeInit} isJson={false} />
      <p>
        If you do not have one, you can create a new wallet with{' '}
        <code>AppWallet.brew()</code>.
      </p>
      <Codeblock
        data={`import { AppWallet } from '@meshsdk/core';\n\nconst mnemonic = AppWallet.brew();`}
        isJson={false}
      />
      <p>
        Let's load our <code>solution</code> wallet and get its address.
      </p>
      <Codeblock
        data={`const address = wallet.getPaymentAddress();`}
        isJson={false}
      /> */}

      <ShowMoreDetails label="Live demo">
        <>
          <Codeblock data={codeDemo} isJson={false} />

          <RunDemoButton
            runDemoFn={demoLoadWallet}
            loading={loading}
            response={response}
            label="Build transaction and mint token"
          />
          <RunDemoResult response={response} />

          <p>
            If you see a hash, the transaction has been successful submitted. Go
            to{' '}
            <a
              href={`https://preprod.cardanoscan.io/transaction/${response}`}
              rel="noreferrer"
              className="link"
              target="_blank"
            >
              preprod.cardanoscan.io
            </a>{' '}
            to check the transaction details.
          </p>
        </>
      </ShowMoreDetails>
    </Element>
  );
}
