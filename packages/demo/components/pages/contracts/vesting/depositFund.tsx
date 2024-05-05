import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import Button from '../../../ui/button';
import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from 'react';
import RunDemoResult from '../../../common/runDemoResult';
import useLocalStorage from '../../../../hooks/useLocalStorage';
import Link from 'next/link';
import { getContract } from './common';
import { Asset } from '@meshsdk/core';

export default function VestingDepositFund() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="depositFund"
        header="Deposit Fund"
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
        Party A will deposit funds into the vesting contract, defining the
        locking period and the beneficiary address.
      </p>
      <p>
        <code>depositFund()</code> deposit funds into
        a vesting contract. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>assets (Asset[])</b> - a list of assets
        </li>
        <li>
          <b>lockUntilTimeStampMs (number)</b> - timestamp in milliseconds
        </li>
        <li>
          <b>beneficiary (string)</b> - address of the beneficiary
        </li>
      </ul>
    </>
  );
}

function Right() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'mesh_vesting_demo',
    undefined
  );

  async function rundemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const contract = getContract(wallet);

      const assets: Asset[] = [
        {
          unit: 'lovelace',
          quantity: '8000000',
        },
      ];

      const lockUntilTimeStamp = new Date();
      lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);

      const beneficiary =
        'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9';

      const tx = await contract.depositFund(
        assets,
        lockUntilTimeStamp.getTime(),
        beneficiary
      );

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
  code += `const assets: Asset[] = [\n`;
  code += `  {\n`;
  code += `    unit: 'lovelace',\n`;
  code += `    quantity: '8000000',\n`;
  code += `  },\n`;
  code += `];\n`;
  code += `\n`;
  code += `const lockUntilTimeStamp = new Date();\n`;
  code += `lockUntilTimeStamp.setMinutes(lockUntilTimeStamp.getMinutes() + 1);\n`;
  code += `\n`;
  code += `const beneficiary = 'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9';\n`;
  code += `\n`;
  code += `const tx = await contract.depositFund(\n`;
  code += `  assets,\n`;
  code += `  lockUntilTimeStamp.getTime(),\n`;
  code += `  beneficiary\n`;
  code += `);\n`;
  code += `\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <Card>
      <p>
        We will deposit 8 ADA to the vesting contract. This vesting period is 1
        minute and the beneficiary address is:{' '}
        <code>addr_test1qpvx0...u0nq93swx9</code>.
      </p>
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
            Deposit Fund
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
