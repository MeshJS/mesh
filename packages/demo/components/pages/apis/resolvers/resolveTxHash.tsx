import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import {
  resolveTxHash,
  Transaction,
  AppWallet,
  BlockfrostProvider,
} from '@meshsdk/core';
import { demoAddresses, demoPrivateKey } from '../../../../configs/demo';

export default function ResolveTxHash() {
  return (
    <SectionTwoCol
      sidebarTo="resolveTxHash"
      header="Resolve Transaction Hash"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `import { resolveTxHash } from '@meshsdk/core';\n`;
  code += `const tx = new Transaction({ initiator: wallet });\n`;
  code += `tx.sendLovelace(demoAddresses.testnet, '1500000');\n`;
  code += `const unsignedTx = await tx.build();\n`;
  code += `const hash1 = resolveTxHash(unsignedTx);\n`;
  code += `const signedTx = await wallet.signTx(unsignedTx, false);\n`;
  code += `const hash2 = resolveTxHash(signedTx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;
  code += `// txHash == hash1 == hash2`;

  return (
    <>
      <p>
        Provide a <code>cborTx</code>, <code>resolveTxHash</code> will
        return the transaction hash.
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const blockchainProvider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
      );
      const wallet = new AppWallet({
        networkId: 0,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        key: {
          type: 'root',
          bech32: demoPrivateKey,
        },
      });
      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(demoAddresses.testnet, '1500000');
      const unsignedTx = await tx.build();
      const hash = resolveTxHash(unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx, false);
      setResponse(hash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
