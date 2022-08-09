import { useState } from 'react';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import { AssetsContainer } from '../blocks/assetscontainer';
import useWallet from '../../contexts/wallet';
import Mesh from '@martifylabs/mesh';
import { TransactionService, resolveDataHash } from '@martifylabs/mesh';
import type { Asset } from '@martifylabs/mesh';
import { LinkCardanoscanTx } from '../blocks/linkCardanoscanTx';
import ConnectWallet from '../wallet/connectWallet';

export default function LockUnlockContract() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Lock and unlock assets on smart contract</h3>
          <p>
            Token locking is a feature where certain assets are reserved on the
            smart contract. The assets can only be unlocked when certain
            conditions are met, for example, when making a purchase.
          </p>
          <p>
            In this showcase, we will lock selected assets from your wallet to
            an &quot;always succeed&quot; smart contract, where unlocking assets
            requires the correct datum. In practice, multiple assets (both
            native assets and lovelace) can be sent to the contract in a single
            transaction; in this demo, we restrict to only one asset.
          </p>
          <p>Note: this feature only works on testnet.</p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const { wallet, walletConnected, walletNameConnected } = useWallet();
  const [state, setState] = useState<number>(0);

  const [inputDatum, setInputDatum] = useState<string>('supersecret'); // user input for datum
  const [selectedAsset, setSelectedAsset] = useState<string>(''); // user input for selected asset unit

  const [resultLock, setResultLock] = useState<null | string>(null); // reponse from lock
  const [resultUnlock, setResultUnlock] = useState<null | string>(null); // reponse from unlock
  const [hasLocked, setHasLocked] = useState<boolean>(false); // toggle to show unlock section

  // always succeed
  // const script = '4e4d01000033222220051200120011';
  // const scriptAddress = 'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';
  // hello world
  const script =
    '5860585e0100003332223232323322323232322225335300d333500c00b0035004100913500700913350010024830af38f1ab66490480048dd4000891a8021a9801000a4c24002400224c44666ae68cdd78010008030028900089100109100090009';
  const scriptAddress =
    'addr_test1wrs527svgl0m0ghkhramqkdae643v0q96d83jku8h8etxrs58smpj';

  ////

  function toggleSelectedAssets(index, asset: Asset) {
    setSelectedAsset(asset.unit);
  }

  async function _getAssetUtxo({ scriptAddress, asset, dataHash }) {
    await Mesh.blockfrost.init({
      blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      network: 0,
    });

    let utxosFromBF = await Mesh.blockfrost.addressesAddressUtxosAsset({
      address: scriptAddress,
      asset: asset,
    });
    console.log(`utxos that has ${asset}:`, utxosFromBF);

    let utxos = utxosFromBF
      .filter((utxo: any) => {
        return utxo.data_hash == dataHash;
      })
      .map((utxoBF: any) => {
        return {
          input: {
            outputIndex: utxoBF.output_index,
            txHash: utxoBF.tx_hash,
          },
          output: {
            address: scriptAddress,
            amount: utxoBF.amount,
          },
        };
      });
    console.log(`utxos that has datahash (${dataHash}):`, utxos);
    
    return utxos[0];
  }

  async function makeTransactionLockAsset() {
    setState(1);
    try {
      // const datumToLock = { secretCode: inputDatum };
      // const datum = { fields: [datumToLock] };
      const datum = { fields: [79600447942433] };
      const assets = [
        {
          unit: selectedAsset,
          quantity: '1',
        },
      ];

      const tx = new TransactionService({ walletService: wallet });
      tx.sendAssets(scriptAddress, assets, { datum: datum });

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResultLock(txHash);
      setHasLocked(true);

      setState(2);
    } catch (error) {
      setResultLock(`${error}`);
      setState(0);
    }
  }

  async function makeTransactionUnlockAsset() {
    setState(3);
    try {
      // const datumToUnlock = { secretCode: inputDatum };
      // const datum = { fields: [datumToUnlock] };
      const datum = { fields: [79600447942433] };
      const dataHash = resolveDataHash(datum);
      console.log('dataHash', dataHash);

      const assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: selectedAsset,
        dataHash: dataHash,
      });
      console.log('assetUtxo', assetUtxo);

      if (assetUtxo) {
        const tx = new TransactionService({ walletService: wallet });
        tx.redeemFromScript(assetUtxo, script, { datum: datum }).sendValue(
          await wallet.getChangeAddress(),
          assetUtxo
        );

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        console.log('signedTx', signedTx);
        const txHash = await wallet.submitTx(signedTx);
        setResultUnlock(txHash);

        setState(4);
      } else {
        setResultUnlock('Input UTXO from script is not found.');
        setState(2);
      }
    } catch (error) {
      console.log('error', error);
      setResultUnlock(`${error}`);
      setState(2);
    }
  }

  // codeSnippet1
  let codeSnippet1 = `const datum = { fields: [{ secretCode: '${inputDatum}' }] };\n`;
  codeSnippet1 += `const assets = [\n`;
  codeSnippet1 += `  {\n`;
  codeSnippet1 += `    unit: '${selectedAsset}',\n`;
  codeSnippet1 += `    quantity: '1',\n`;
  codeSnippet1 += `  }\n`;
  codeSnippet1 += `];\n\n`;

  codeSnippet1 += `const tx = new TransactionService({ walletService: wallet })\n`;
  codeSnippet1 += `  .sendAssets(\n`;
  codeSnippet1 += `    '${scriptAddress}', // SCRIPT ADDRESS HERE\n`;
  codeSnippet1 += `    assets,\n`;
  codeSnippet1 += `    { datum: datum }\n`;
  codeSnippet1 += `  );\n\n`;

  codeSnippet1 += `const unsignedTx = await tx.build();\n`;
  codeSnippet1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet1 += `const txHash = await wallet.submitTx(signedTx);`;

  // codeSnippet2
  let codeSnippet2 = `import { resolveDataHash } from '@martifylabs/mesh';\n\n`;

  codeSnippet2 += `const script = '${script}'; // SCRIPT CBOR HERE\n`;
  codeSnippet2 += `const datum = { fields: [{ secretCode: '${inputDatum}' }] };\n`;
  codeSnippet2 += `const dataHash = resolveDataHash(datum);\n`;
  codeSnippet2 += `const assetUtxo = await getAssetUtxo('${scriptAddress}', '${selectedAsset}', dataHash); // this get UTXO from the script address;\n\n`;

  codeSnippet2 += `const tx = new TransactionService({ walletService: wallet })\n`;
  codeSnippet2 += `  .redeemFromScript(\n`;
  codeSnippet2 += `    assetUtxo, \n`;
  codeSnippet2 += `    script, \n`;
  codeSnippet2 += `    { datum: datum }\n`;
  codeSnippet2 += `  )\n`;
  codeSnippet2 += `  .sendValue(\n`;
  codeSnippet2 += `    await wallet.getChangeAddress(),\n`;
  codeSnippet2 += `    assetUtxo\n`;
  codeSnippet2 += `  );\n\n`;

  codeSnippet2 += `const unsignedTx = await tx.build();\n`;
  codeSnippet2 += `const signedTx = await wallet.signTx(unsignedTx, true); // note the partial sign here \n`;
  codeSnippet2 += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <h3>Lock assets</h3>
      <p>
        In this section, we will lock an asset into the smart contract by
        attaching a hash of the datum to it. Connect your wallet and fetch the
        assets. Then, selects one of the assets to be sent to the smart contract
        for locking. Lastly, define a code to create the datum, the same datum
        hash must be provided to unlock the asset.
      </p>

      <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <tbody>
          <tr>
            <td className="py-4 px-4" colSpan={2}>
              <AssetsContainer
                index={0}
                selectedAssets={{
                  [selectedAsset]: 1,
                }}
                toggleSelectedAssets={toggleSelectedAssets}
              />
            </td>
          </tr>
          <tr>
            <td className="py-4 px-4 w-1/4">Datum</td>
            <td className="py-4 px-4 w-3/4">
              <Input
                value={inputDatum}
                onChange={(e) => setInputDatum(e.target.value)}
                placeholder="a secret code to create datum"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <Codeblock data={codeSnippet1} isJson={false} />

      {walletConnected ? (
        <Button
          onClick={() => makeTransactionLockAsset()}
          disabled={state == 1}
          style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
        >
          Run code snippet to lock assets
        </Button>
      ) : (
        <ConnectWallet />
      )}

      {resultLock && (
        <>
          <h4>Result from lock assets</h4>
          <Codeblock data={resultLock} />
          {state >= 2 && <LinkCardanoscanTx txHash={resultLock} />}
        </>
      )}

      <div className="flex">
        <h3>Unlock assets</h3>
        <div className="p-1 pt-9">
          <Toggle value={hasLocked} onChange={setHasLocked} />
        </div>
      </div>

      {hasLocked && (
        <>
          <p>
            In this section, you can create transactions to unlock the assets
            with a redeemer that corresponds to the datum. Define the
            corresponding code to create the datum, only a transaction with the
            corrent datum hash is able to unlock the asset. Define the{' '}
            <code>unit</code> of the locked asset to search for the UTXO in the
            smart contract, which is required for the transaction&apos;s input.
          </p>
          <p>
            Note: give some time for the transaction to confirm before attempt
            unlocking, you can check the transaction status using on
            CardanoScan.
          </p>
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Locked asset</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    placeholder="asset unit to unlock from contract"
                  />
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 w-1/4">Datum</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={inputDatum}
                    onChange={(e) => setInputDatum(e.target.value)}
                    placeholder="that secret code to unlock"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <Codeblock data={codeSnippet2} isJson={false} />

          {walletConnected && hasLocked && (
            <Button
              onClick={() => makeTransactionUnlockAsset()}
              disabled={state == 1}
              style={state == 3 ? 'warning' : state == 4 ? 'success' : 'light'}
            >
              Run code snippet to unlock assets
            </Button>
          )}
          {!walletConnected && <ConnectWallet />}
        </>
      )}

      {resultUnlock && (
        <>
          <h4>Result from unlock assets</h4>
          <Codeblock data={resultUnlock} />
          {state == 4 && <LinkCardanoscanTx txHash={resultUnlock} />}
        </>
      )}
    </>
  );
}
