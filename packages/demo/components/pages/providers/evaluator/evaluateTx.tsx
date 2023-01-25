import { useState } from 'react';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import Card from '../../../ui/card';
import Codeblock from '../../../ui/codeblock';
import { Transaction, KoiosProvider, resolveDataHash } from '@meshsdk/core';
import { useWallet, CardanoWallet } from '@meshsdk/react';

export function evaluateTxLeft({ evaluatorName }) {
  let code1 = ``;
  code1 += `const unsignedTx = await tx.build();\n`;
  code1 += `const evaluateTx = await ${evaluatorName}.evaluateTx(unsignedTx);\n`;

  let demoResults = ``;
  demoResults += `[\n`;
  demoResults += `  {\n`;
  demoResults += `    "index": 0,\n`;
  demoResults += `    "tag": "SPEND",\n`;
  demoResults += `    "budget": {\n`;
  demoResults += `      "mem": 1700,\n`;
  demoResults += `      "steps": 368100\n`;
  demoResults += `    }\n`;
  demoResults += `  }\n`;
  demoResults += `]\n`;

  let codeRedeemer = ``;
  codeRedeemer += `const redeemer = {\n`;
  codeRedeemer += `  data: { alternative: 0, fields: [...] },\n`;
  codeRedeemer += `  budget: {\n`;
  codeRedeemer += `    mem: 1700,\n`;
  codeRedeemer += `    steps: 368100,\n`;
  codeRedeemer += `  },\n`;
  codeRedeemer += `};\n`;

  return (
    <>
      <p>
        <code>evaluateTx()</code> accepts an unsigned transaction (
        <code>unsignedTx</code>) and it evaluates the resources required to
        execute the transaction. Note that, this is only valid for transaction
        interacting with redeemer (smart contract). By knowing the budget
        required, you can use this to adjust the redeemer's budget so you don't
        spend more than you need to execute transactions for this smart
        contract.
      </p>
      <Codeblock data={code1} isJson={false} />
      <p>
        Example responses from unlocking assets from the always succeed smart
        contract.
      </p>
      <Codeblock data={demoResults} isJson={false} />
      <p>
        With the <code>mem</code> and <code>steps</code>, you can refine the
        budget for the redeemer. For example:
      </p>
      <Codeblock data={codeRedeemer} isJson={false} />
    </>
  );
}

export function evaluateTxRight({ evaluator }) {
  const { wallet, connected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const koios = new KoiosProvider('preprod');

    const utxos = await koios.fetchAddressUTxOs(scriptAddress, asset);

    const dataHash = resolveDataHash(datum);

    let utxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });

    return utxo;
  }

  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);

    try {
      const assetUtxo = await _getAssetUtxo({
        scriptAddress:
          'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8',
        asset:
          '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',
        datum: 'supersecretmeshdemo',
      });

      const address = await wallet.getChangeAddress();

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: {
            version: 'V1',
            code: '4e4d01000033222220051200120011',
          },
          datum: 'supersecretmeshdemo',
        })
        .sendValue(address, assetUtxo)
        .setRequiredSigners([address]);

      const unsignedTx = await tx.build();
      const evaluateTx = await evaluator.evaluateTx(unsignedTx);

      setResponse(evaluateTx);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <p>
          Unlock an asset from the always succeed to check how much it takes to
          execute this transaction.
        </p>
        {connected ? (
          <>
            <RunDemoButton
              runDemoFn={runDemo}
              loading={loading}
              response={response}
            />
          </>
        ) : (
          <CardanoWallet />
        )}

        <RunDemoResult response={response} label="Response evaluateTx" />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
