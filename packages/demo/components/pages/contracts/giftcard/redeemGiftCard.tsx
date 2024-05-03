import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import { getContract } from './common';

export default function GiftcardRedeem() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="redeemGiftCard"
        header="Redeem Giftcard"
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
        This function, <code>redeemGiftCard()</code>, is used to redeem a gift
        card. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>giftCardUtxo (UTxO)</b> - unspent transaction output in the script
        </li>
      </ul>
      <p>
        The function returns a transaction hash if the gift card is successfully
        redeemed. It will burn the gift card and transfer the value to the
        wallet signing this transaction.
      </p>
      <p>The code snippet below demonstrates how to redeem a gift card.</p>
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

      const utxo = await contract.getUtxoByTxHash(userLocalStorage);

      if (!utxo) {
        setResponseError('Input utxo not found');
        setLoading(false);
        return;
      }

      const tx = await contract.redeemGiftCard(utxo);
      const signedTx = await wallet.signTx(tx, true);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash(txHashToSearchFor);\n`;
  code += `const tx = await contract.redeemGiftCard(utxo);\n`;
  code += `const signedTx = await wallet.signTx(tx, true);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
      <p>
        This demo, we will redeem the giftcard that was created in the previous
        step. You may connect with another wallet to claim the giftcard
      </p>
      <Codeblock data={code} isJson={false} />
      {connected ? (
        <>
          <Button
            onClick={() => rundemo()}
            style={
              loading ? 'warning' : response !== null ? 'success' : 'light'
            }
            disabled={loading || userLocalStorage === undefined}
          >
            Redeem Giftcard
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
