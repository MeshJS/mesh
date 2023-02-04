import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';
import { Transaction, resolveDataHash, KoiosProvider } from '@meshsdk/core';
import Link from 'next/link';
import useDemo from '../../../../contexts/demo';

// always succeed
const script = '4e4d01000033222220051200120011';
const scriptAddress =
  'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';

export default function UnlockAssets() {
  const { userStorage } = useDemo();
  const [inputDatum, setInputDatum] = useState<string>('supersecret'); // user input for datum
  const [assetUnit, setAssetUnit] = useState<string>(
    '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e'
  );

  useEffect(() => {
    if (userStorage.lockedAssetUnit && userStorage.lockedAssetUnit.length) {
      setAssetUnit(userStorage.lockedAssetUnit);
    }
  }, [userStorage]);

  return (
    <SectionTwoCol
      sidebarTo="unlockAssets"
      header="Unlock Assets from Smart Contract"
      leftFn={Left({ assetUnit, inputDatum })}
      rightFn={Right({ assetUnit, setAssetUnit, inputDatum, setInputDatum })}
    />
  );
}

function Left({ assetUnit, inputDatum }) {
  let codeSnippetGetAssetUtxo = ``;
  codeSnippetGetAssetUtxo += `async function _getAssetUtxo({ scriptAddress, asset, datum }) {\n`;
  codeSnippetGetAssetUtxo += `  const koios = new KoiosProvider('preprod');\n\n`;
  codeSnippetGetAssetUtxo += `  const utxos = await koios.fetchAddressUTxOs(\n`;
  codeSnippetGetAssetUtxo += `    scriptAddress,\n`;
  codeSnippetGetAssetUtxo += `    asset\n`;
  codeSnippetGetAssetUtxo += `  );\n\n`;
  codeSnippetGetAssetUtxo += `  const dataHash = resolveDataHash(datum);\n\n`;
  codeSnippetGetAssetUtxo += `  let utxo = utxos.find((utxo: any) => {\n`;
  codeSnippetGetAssetUtxo += `    return utxo.output.dataHash == dataHash;\n`;
  codeSnippetGetAssetUtxo += `  });\n\n`;
  codeSnippetGetAssetUtxo += `  return utxo;\n`;
  codeSnippetGetAssetUtxo += `}\n`;

  let codeSnippetCallAssetUtxo = '';
  codeSnippetCallAssetUtxo += `// fetch input UTXO\n`;
  codeSnippetCallAssetUtxo += `const assetUtxo = await _getAssetUtxo({\n`;
  codeSnippetCallAssetUtxo += `  scriptAddress: '${scriptAddress}',\n`;
  codeSnippetCallAssetUtxo += `  asset: '${assetUnit}',\n`;
  codeSnippetCallAssetUtxo += `  datum: '${inputDatum}',\n`;
  codeSnippetCallAssetUtxo += `});`;

  let codeSnippetCreateTx = '';
  codeSnippetCreateTx += `// create the unlock asset transaction\n`;
  codeSnippetCreateTx += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippetCreateTx += `  .redeemValue({\n`;
  codeSnippetCreateTx += `    value: assetUtxo,\n`;
  codeSnippetCreateTx += `    script: {\n`;
  codeSnippetCreateTx += `      version: 'V1',\n`;
  codeSnippetCreateTx += `      code: '${script}',\n`;
  codeSnippetCreateTx += `    },\n`;
  codeSnippetCreateTx += `    datum: '${inputDatum}',\n`;
  codeSnippetCreateTx += `  })\n`;

  codeSnippetCreateTx += `  .sendValue(address, assetUtxo) // address is recipient address\n`;
  codeSnippetCreateTx += `  .setRequiredSigners([address]);\n`;

  let codeSnippetSign = `const unsignedTx = await tx.build();\n`;
  codeSnippetSign += `// note that the partial sign is set to true\n`;
  codeSnippetSign += `const signedTx = await wallet.signTx(unsignedTx, true);\n`;

  let codeSnippet = ``;

  codeSnippet += codeSnippetGetAssetUtxo;
  codeSnippet += `\n`;

  codeSnippet += `// fetch input UTXO\n`;
  codeSnippet += `const assetUtxo = await _getAssetUtxo({\n`;
  codeSnippet += `  scriptAddress: '${scriptAddress}',\n`;
  codeSnippet += `  asset: '${assetUnit}',\n`;
  codeSnippet += `  datum: '${inputDatum}',\n`;
  codeSnippet += `});\n\n`;

  codeSnippet += `// get wallet change address\n`;
  codeSnippet += `const address = await wallet.getChangeAddress();\n\n`;

  codeSnippet += codeSnippetCreateTx;
  codeSnippet += `\n`;

  codeSnippet += codeSnippetSign;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <p>
        As we may have locked assets in the contract, you can create
        transactions to unlock the assets with a redeemer that corresponds to
        the datum. Define the corresponding code to create the datum, only a
        transaction with the corrent datum hash is able to unlock the asset.
        Define the <code>unit</code> of the locked asset to search for the UTXO
        in the smart contract, which is required for the transaction's input.
      </p>
      <p>
        First, let's create a function to fetch input UTXO from the script
        address. This input UTXO is needed for transaction builder. In this
        demo, we are using <code>KoiosProvider</code>, but this can be
        interchange with other providers that Mesh provides, see{' '}
        <Link href="/apis/providers">Providers</Link>.
      </p>
      <Codeblock data={codeSnippetGetAssetUtxo} isJson={false} />
      <p>
        Then, we query the script address for the UTXO that contain the data
        hash:
      </p>
      <Codeblock data={codeSnippetCallAssetUtxo} isJson={false} />
      <p>
        Then, we create the transaction.{' '}
        <code>4e4d01000033222220051200120011</code> is the script CBOR for{' '}
        <code>always succeed</code> smart contract.
      </p>
      <Codeblock data={codeSnippetCreateTx} isJson={false} />
      <p>
        Lastly, we build and sign the transaction. Note that here we need to set
        partial sign to <code>true</code>.
      </p>
      <Codeblock data={codeSnippetSign} isJson={false} />
      <p>
        Putting them all together, here's the code to unlock assets from smart
        contract:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ assetUnit, setAssetUnit, inputDatum, setInputDatum }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    // const blockfrostProvider = new BlockfrostProvider(
    //   process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
    // );
    const blockchainProvider = new KoiosProvider('preprod');
    const utxos = await blockchainProvider.fetchAddressUTxOs(
      scriptAddress,
      asset
    );
    const dataHash = resolveDataHash(datum);

    let utxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });
    return utxo;
  }

  async function runDemo() {
    setState(1);
    setResponseError(null);

    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddress,
      asset: assetUnit,
      datum: inputDatum,
    });
    console.log('assetUtxo', assetUtxo);

    if (assetUtxo === undefined) {
      setResponseError(`Input UTXO from script is not found.`);
      setState(0);
      return;
    }

    try {
      const address = await wallet.getChangeAddress();

      const tx = new Transaction({ initiator: wallet })
        .redeemValue({
          value: assetUtxo,
          script: {
            version: 'V1',
            code: script,
          },
          datum: inputDatum,
        })
        .sendValue(address, assetUtxo)
        .setRequiredSigners([address]);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
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
        assetUnit={assetUnit}
        setAssetUnit={setAssetUnit}
        inputDatum={inputDatum}
        setInputDatum={setInputDatum}
      />

      {connected ? (
        <>
          <RunDemoButton
            runDemoFn={runDemo}
            loading={state == 1}
            response={response}
            label="Unlock asset"
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

function InputTable({ assetUnit, setAssetUnit, inputDatum, setInputDatum }) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Unlock assets from smart contract
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Define the datum and asset's unit to unlock assets in smart
            contract. Note: give some time for the transaction to confirm before
            attempt unlocking. This demo only works on <code>preview</code>{' '}
            network.
          </p>
        </caption>
        <thead className="thead">
          <tr>
            <th scope="col" className="py-3">
              Unlock assets in smart contract
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
            <td>
              <Input
                value={inputDatum}
                onChange={(e) => setInputDatum(e.target.value)}
                placeholder="Datum"
                label="Datum"
              />
              <Input
                value={assetUnit}
                onChange={(e) => setAssetUnit(e.target.value)}
                placeholder="Unit"
                label="Unit"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
