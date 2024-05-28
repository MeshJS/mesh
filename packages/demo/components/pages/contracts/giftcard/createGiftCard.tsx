import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import { Asset } from '@meshsdk/common';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getContract } from './common';

export default function GiftcardCreate() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="createGiftCard"
        header="Create Giftcard"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        <code>createGiftCard()</code> create a gift card. The function accepts
        the following parameters:
      </p>
      <ul>
        <li>
          <b>tokenName (string)</b> - name of the token
        </li>
        <li>
          <b>giftValue (Asset[])</b> - a list of assets
        </li>
      </ul>
      <p>
        The function returns a transaction hash if the gift card is successfully
        created.
      </p>
      <p>
        The code snippet below demonstrates how to create a gift card with a
        value of 20 ADA.
      </p>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_giftcard_demo',
    undefined
  );

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      const tokenName = `Mesh_Gift_Card_${parseInt(
        (Math.random() * 1000).toString()
      )}`;
      const giftValue: Asset[] = [
        {
          unit: 'lovelace',
          quantity: '20000000',
        },
      ];

      const tx = await contract.createGiftCard(tokenName, giftValue);
      const signedTx = await wallet.signTx(tx);
      const txHash = await wallet.submitTx(signedTx);
      setUserlocalStorage(txHash);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const tokenName = 'Mesh Gift Card';\n`;
  code += `const giftValue: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: 'lovelace',\n`;
  code += `    quantity: '20000000',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const tx = await contract.createGiftCard(tokenName, giftValue);\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
      <p>This demo, we will create a giftcard containing 20 ADA.</p>
      <Codeblock data={code} isJson={false} />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading}
          >
            Create Giftcard
          </Button>
          <RunDemoResult response={response} />
        </>
      ) : (
        <CardanoWallet />
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
