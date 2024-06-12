import { useEffect, useState } from 'react';
import Codeblock from '../../../../ui/codeblock';
import Card from '../../../../ui/card';
import RunDemoButton from '../../../../common/runDemoButton';
import RunDemoResult from '../../../../common/runDemoResult';
import SectionTwoCol from '../../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../../common/connectCipWallet';
import Input from '../../../../ui/input';
import { Transaction, resolveDataHash, KoiosProvider } from '@meshsdk/core';
import Link from 'next/link';
import useDemo from '../../../../../contexts/demo';
import { assetAsset } from '../../../../../configs/demo';

// always succeed
const script = '4e4d01000033222220051200120011';
const scriptAddress =
  'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';

export default function UnlockAssets() {
  const { userStorage } = useDemo();
  const [inputDatum, setInputDatum] = useState<string>('supersecret'); // user input for datum
  const [assetUnit, setAssetUnit] = useState<string>(assetAsset);

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
        To unlock assets locked in a smart contract, you need to create a
        transaction that supplies the correct datum. In fact, only a transaction
        with the corrent datum supplied is able to unlock the assets. in the
        smart contract, which is required for the transaction's input. In our
        example, we shall also define the <code>unit</code> of the asset we are
        searching for so that we can search for the suitable UTxO.
      </p>
      <p>
        First, let's create a function to fetch the correct input UTxO from the
        script address. This input UTxO is needed for the transaction builder.
        Notee that in this demo, we are using <code>KoiosProvider</code>, but
        any of the providers which are implemented by Mesgh can be used (see{' '}
        <Link href="/apis/providers">Providers</Link> for list).
      </p>
      <Codeblock data={codeSnippetGetAssetUtxo} isJson={false} />
      <p>
        Then, we query the script address for the UTxO that contains the correct
        data hash:
      </p>
      <Codeblock data={codeSnippetCallAssetUtxo} isJson={false} />
      <p>
        Next, we create the transaction.{' '}
        <code>4e4d01000033222220051200120011</code> is the script CBOR for the{' '}
        <code>always succeed</code> smart contract.
      </p>
      <Codeblock data={codeSnippetCreateTx} isJson={false} />
      <p>
        Lastly, we build and sign the transaction. Note that here we need to set
        the 'partial sign' parameter to <code>true</code>.
      </p>
      <Codeblock data={codeSnippetSign} isJson={false} />
      <p>
        Putting it all together, here's the code to unlock assets from smart
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
    setResponse(null);
    setResponseError(null);

    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddress,
      asset: assetUnit,
      datum: inputDatum,
    });

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
            Define the datum and <code>Unit</code> of the asset to unlock it
            from the smart contract.{' '}
            <i>
              Note: remember that this requires interaction with a blockchain:
              allow some time for the transaction to confirm before attempt
              unlocking. This demo only works on <code>preprod</code> network.
            </i>
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
