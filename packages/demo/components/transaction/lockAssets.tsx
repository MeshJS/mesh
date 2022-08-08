import { useState, useEffect } from 'react';
import Mesh from '@martifylabs/mesh';
import { Button, Card, Codeblock, Input } from '../../components';
import useWallet from '../../contexts/wallet';
import { TransactionService } from '@martifylabs/mesh';
import { AssetsContainer } from '../blocks/assetscontainer';
import { Asset } from '@martifylabs/mesh/dist/common/types';

export default function LockAssets() {
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
            an "always succeed" smart contract, where unlocking assets requires
            the correct datum.
          </p>
          <p>Note: recommended to test this feature on testnet only.</p>
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

  const [inputDatum, setInputDatum] = useState<string>('abc'); // user input for datum
  const [selectedAssets, setSelectedAssets] = useState<{
    [assetId: string]: number;
  }>({}); // user selected assets for locking

  const [resultLock, setResultLock] = useState<null | string>(null); // reponse from lock
  const [resultUnlock, setResultUnlock] = useState<null | string>(null); // reponse from unlock

  // set during locking
  const [lockedAssets, setLockedAssets] = useState<Asset[]>([
    {
      unit: 'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a534f4349455459',
      quantity: '1',
    },
  ]);
  const [hasLocked, setHasLocked] = useState<boolean>(true);

  let selectedAssetsList = Object.keys(selectedAssets).map((assetId) => {
    return {
      unit: assetId,
      quantity: selectedAssets[assetId].toString(),
    };
  });

  const script = '4e4d01000033222220051200120011';
  const scriptAddress =
    'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';

  async function debug() {
    /**
     * to check BF tx hash
     */
    // await Mesh.blockfrost.init({
    //   blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
    //   network: 0,
    // });
    // let result = await Mesh.blockfrost.transactionsTransactionUTXOs({
    //   hash: '3c0fc4774e529432b2eaa654720231ad6c6d92ae2a4a7ab2544a93dcfa3c8561',
    // });
    // console.log('result', result);
  }

  async function makeTransaction() {
    setState(1);
    try {
      const tx = new TransactionService({ walletService: wallet });

      const isLocking = false;
      const datum = { fields: [{ secretCode: 'abc' }] };
      const script = '4e4d01000033222220051200120011';
      const scriptAddress =
        'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8';
      const asset = {
        unit: 'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a534f4349455459', // society
        quantity: '1',
      };

      // // lock
      if (isLocking) {
        tx.sendAssets(scriptAddress, [asset], {
          datum: datum,
          coinsPerByte: '4310', // need this?
        });

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        setResultLock(txHash);
      }

      // // unlock
      else {
        const dataHash = TransactionService.createDatumHash(datum);

        let assetUtxo = await _getAssetUtxo({
          scriptAddress: scriptAddress,
          asset: asset.unit,
          dataHash: dataHash,
        });

        tx.redeemFromScript(assetUtxo, script, {
          datum: datum,
          redeemer: {
            // to remove?
            index: assetUtxo.input.outputIndex,
            budget: {
              mem: 7000000,
              steps: 3000000000,
            },
            data: { fields: [] },
            tag: 'SPEND',
          },
        }).sendAssets(await wallet.getChangeAddress(), [asset]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        const txHash = await wallet.submitTx(signedTx);
        setResultLock(txHash);
      }

      setState(2);
    } catch (error) {
      setResultLock(`${error}`);
      setState(0);
    }
  }

  ///////////////

  function toggleSelectedAssets(index, asset: Asset) {
    let newSelectedAssets = { ...selectedAssets };

    if (asset.unit in newSelectedAssets) {
      delete newSelectedAssets[asset.unit];
    } else {
      newSelectedAssets[asset.unit] = 1;
    }

    setSelectedAssets(newSelectedAssets);
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
    console.log('utxosFromBF', utxosFromBF);

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
            address:
              'addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8',
            amount: utxoBF.amount,
          },
        };
      });

    return utxos[0];
  }

  async function makeTransactionLockAsset() {
    console.log('selectedAssets', selectedAssets);

    setState(1);
    try {
      setLockedAssets(selectedAssetsList);
      const datumToLock = { secretCode: inputDatum };
      const datum = { fields: [datumToLock] };

      console.log(1, selectedAssetsList);
      console.log(2, datumToLock);

      const tx = new TransactionService({ walletService: wallet });

      tx.sendAssets(scriptAddress, selectedAssetsList, {
        datum: datum,
        coinsPerByte: '4310', // need this?
      });

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
    console.log(11);
    setState(1);
    try {
      const datumToUnlock = { secretCode: inputDatum };
      const datum = { fields: [datumToUnlock] }; // still find the `fields` unnecessary
      const dataHash = TransactionService.createDatumHash(datum);
      console.log('dataHash', dataHash);

      let assetUtxo = await _getAssetUtxo({
        scriptAddress: scriptAddress,
        asset: lockedAssets[0].unit, // we pick the first asset to search
        dataHash: dataHash,
      });
      console.log('assetUtxo', assetUtxo);

      const tx = new TransactionService({ walletService: wallet });
      tx.redeemFromScript(assetUtxo, script, {
        datum: datum,
        redeemer: {
          // to remove?
          index: assetUtxo.input.outputIndex,
          budget: {
            mem: 7000000,
            steps: 3000000000,
          },
          data: { fields: [] },
          tag: 'SPEND',
        },
      }).sendAssets(await wallet.getChangeAddress(), lockedAssets);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      setResultUnlock(txHash);

      setState(2);
    } catch (error) {
      setResultUnlock(`${error}`);
      setState(0);
    }
  }

  let codeSnippet = 'code here;';
  let codeSnippet2 = 'code here;';

  return (
    <>
      {!hasLocked && (
        <>
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4" colSpan={2}>
                  <AssetsContainer
                    index={0}
                    selectedAssets={selectedAssets}
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

          <Codeblock data={codeSnippet} isJson={false} />

          {walletConnected && (
            <Button
              onClick={() => makeTransactionLockAsset()}
              disabled={state == 1}
              style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
            >
              Run code snippet
            </Button>
          )}
          {resultLock && (
            <>
              <h4>Result</h4>
              <Codeblock data={resultLock} />
            </>
          )}
        </>
      )}

      {hasLocked && (
        <>
          <h3>You have locked some assets</h3>
          <p>
            Please give some time for the transaction to confirm before attempt
            unlocking.
          </p>

          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Locked assets</td>
                <td className="py-4 px-4 w-3/4">
                  <Codeblock data={lockedAssets} />
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
              style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
            >
              Run code snippet
            </Button>
          )}
          {resultUnlock && (
            <>
              <h4>Result</h4>
              <Codeblock data={resultUnlock} />
            </>
          )}
        </>
      )}

      <Button
        onClick={() => makeTransaction()}
        disabled={!walletConnected || state == 1}
      >
        debug
      </Button>
    </>
  );
}
