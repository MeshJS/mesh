import { useEffect, useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import { demoAddresses } from '../../../../../configs/demo';
import { Transaction, ForgeScript, Mint } from '@meshsdk/core';

export default function MintingRoyaltyToken() {
  const [rate, setRate] = useState<string>('0.2');
  const [addr, setAddr] = useState<string>(demoAddresses.testnet);

  return (
    <SectionTwoCol
      sidebarTo="mintingRoyaltyToken"
      header="Minting Royalty Token"
      leftFn={Left({ rate, addr })}
      rightFn={Right({ rate, setRate, addr, setAddr })}
    />
  );
}

function Left({ rate, addr }) {
  let codeSnippet = ``;
  codeSnippet += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet += `const address = usedAddress[0];\n`;
  codeSnippet += `\n`;
  codeSnippet += `// create forgingScript, you can also use native script here\n`;
  codeSnippet += `const forgingScript = ForgeScript.withOneSignature(address);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `\n`;
  codeSnippet += `const _assetMetadata = {\n`;
  codeSnippet += `  rate: '${rate}',\n`;
  codeSnippet += `  addr: '${addr}'\n`;
  codeSnippet += `};\n`;
  codeSnippet += `const asset: Mint = {\n`;
  codeSnippet += `  assetName: '',\n`;
  codeSnippet += `  assetQuantity: '1',\n`;
  codeSnippet += `  metadata: _assetMetadata,\n`;
  codeSnippet += `  label: '777',\n`;
  codeSnippet += `  recipient: address,\n`;
  codeSnippet += `};\n`;
  codeSnippet += `\n`;
  codeSnippet += `tx.mintAsset(forgingScript, asset);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        Royalty tokens is a special type of token that allows the creator to
        collect a royalty fee, this proposed standard will allow for uniform
        royalties' distributions across the secondary market space. Read{' '}
        <a
          href="https://cips.cardano.org/cips/cip27/"
          target="_blank"
          rel="noreferrer"
        >
          CIP-27
        </a>{' '}
        for more information.
      </p>
      <p>
        The implementation of royalty tokens is very simple, minting a token
        with <code>777</code> label, with "rate" and "addr" in the metadata.
      </p>

      <p>Here is the full code:</p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ rate, setRate, addr, setAddr }) {
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

      const forgingScript = ForgeScript.withOneSignature(address);

      const tx = new Transaction({ initiator: wallet });

      const _assetMetadata = { rate: rate, addr: addr };
      const asset: Mint = {
        assetName: '',
        assetQuantity: '1',
        metadata: _assetMetadata,
        label: '777',
        recipient: address,
      };

      tx.mintAsset(forgingScript, asset);

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
      <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
        Minting Royalty Token
        <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
          Minting a label `777` token with `rate` and `addr`
        </p>
      </div>
      <Input
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="Rate"
        label="Rate"
      />
      <Input
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        placeholder="Address"
        label="Address"
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
