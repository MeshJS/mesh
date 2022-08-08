import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Codeblock, Input } from '../../components';
import { Recipient } from '../../types';
import { CardAsset } from '../blocks/cardassets';
import { AssetsContainer } from '../blocks/assetscontainer';
import { TrashIcon, PlusCircleIcon } from '@heroicons/react/solid';
import useWallet from '../../contexts/wallet';
import { TransactionService } from '@martifylabs/mesh';
import type { Asset, AssetExtended } from '@martifylabs/mesh';

export default function SendMultiassets() {
  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>Send multi-assets to addresses</h3>
          <p>Similar to the sending ADA; for each recipients, append:</p>
          <Codeblock
            data={`.sendAssets(address: string, nativeAssets: { unit: string, quantity: string }[])`}
            isJson={false}
          />
          <p>
            For each asset, <code>unit</code> is required and you can get them
            from <code>wallet.getAssets()</code> (see{' '}
            <Link href="/apis/wallet">Wallet</Link>). You can chain with{' '}
            <code>.sendLovelace()</code> to include ADA in the transaction.
          </p>
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
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [assets, setAssets] = useState<null | AssetExtended[]>(null);

  async function makeTransaction() {
    setState(1);

    try {
      const tx = new TransactionService({ walletService: wallet });

      for (const recipient of recipients) {
        if (recipient.assets.lovelace) {
          tx.sendLovelace(
            recipient.address,
            recipient.assets.lovelace.toString()
          );
        }
        let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
          return assetId != 'lovelace';
        });
        if (nativeAssets.length) {
          let assets: { unit: string; quantity: string }[] = [];
          for (const asset of nativeAssets) {
            let thisAsset = {
              unit: asset,
              quantity: '1',
            };
            assets.push(thisAsset);
          }
          tx.sendAssets(recipient.address, assets);
        }
      }

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResult(txHash);
      setState(2);
    } catch (error) {
      setResult(`${error}`);
      setState(0);
    }
  }

  // async function getAssets() {
  //   setState(1);
  //   const _assets = await wallet.getAssets();
  //   setAssets(_assets.slice(0, 9));
  //   setState(0);
  // }

  function add() {
    let newRecipients = [...recipients];
    newRecipients.push({
      address: '',
      assets: { lovelace: 0 },
    });
    setRecipients(newRecipients);
  }

  function remove(index) {
    let newRecipients = [...recipients];
    newRecipients.splice(index, 1);
    setRecipients(newRecipients);
  }

  function toggleSelectedAssets(index, asset: Asset) {
    let newRecipients = [...recipients];

    if (asset.unit in newRecipients[index].assets) {
      delete newRecipients[index].assets[asset.unit];
    } else {
      newRecipients[index].assets[asset.unit] = 1;
    }

    setRecipients(newRecipients);
  }

  function updateLovelace(index, value) {
    let newRecipients = [...recipients];
    if (value) {
      newRecipients[index].assets['lovelace'] = parseInt(value);
    } else {
      newRecipients[index].assets['lovelace'] = 0;
    }
    setRecipients(newRecipients);
  }

  function updateAddress(index, field, value) {
    let newRecipients = [...recipients];
    newRecipients[index][field] = value;
    setRecipients(newRecipients);
  }

  useEffect(() => {
    async function init() {
      // getAssets();
      const newRecipents = [
        {
          address:
            (await wallet.getNetworkId()) === 1
              ? process.env.NEXT_PUBLIC_TEST_ADDRESS_MAINNET!
              : process.env.NEXT_PUBLIC_TEST_ADDRESS_TESTNET!,
          assets: {
            lovelace: 0,
          },
        },
      ];
      setRecipients(newRecipents);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  let codeSnippet = `const wallet = await WalletService.enable("${
    walletNameConnected ? walletNameConnected : 'eternl'
  }");`;

  codeSnippet += `\n\nconst tx = new TransactionService(wallet)`;
  for (const recipient of recipients) {
    if (recipient.assets.lovelace) {
      codeSnippet += `\n  .sendLovelace(\n    "${recipient.address}",\n    "${recipient.assets.lovelace}"\n  )`;
    }

    let nativeAssets = Object.keys(recipient.assets).filter((assetId) => {
      return assetId != 'lovelace';
    });
    if (nativeAssets.length) {
      codeSnippet += `\n  .sendAssets(\n    "${recipient.address}",`;
      codeSnippet += `\n    [`;
      for (const asset of nativeAssets) {
        codeSnippet += `\n      {`;
        codeSnippet += `\n        unit: "${asset}",`;
        codeSnippet += `\n        quantity: "1",`;
        codeSnippet += `\n      },`;
      }
      codeSnippet += `\n    ]`;
      codeSnippet += `\n  )`;
    }
  }
  codeSnippet += `;`;

  codeSnippet += `\n\nconst unsignedTx = await tx.build();`;
  codeSnippet += `\nconst signedTx = await wallet.signTx(unsignedTx);`;
  codeSnippet += `\nconst txHash = await wallet.submitTx(signedTx);`;

  return (
    <div className="">
      <div>
        <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" colSpan={2} className="py-3 px-6">
                Recipients
              </th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((recipient, i) => {
              return (
                <tr key={i}>
                  <td className="py-4 px-4 w-full">
                    <p>Address:</p>
                    <Input
                      value={recipient.address}
                      onChange={(e) =>
                        updateAddress(i, 'address', e.target.value)
                      }
                      placeholder="address"
                    />
                    <p>Lovelace:</p>
                    <Input
                      value={recipient.assets.lovelace}
                      onChange={(e) => updateLovelace(i, e.target.value)}
                      placeholder="lovelace"
                      type="number"
                    />
                    <AssetsContainer
                      index={i}
                      // assets={assets}
                      selectedAssets={recipient.assets}
                      toggleSelectedAssets={toggleSelectedAssets}
                      // state={state}
                      // getAssets={getAssets}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <Button
                      onClick={() => remove(i)}
                      style="error"
                      disabled={state == 1}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-4 px-4" colSpan={3}>
                <Button
                  onClick={() => add()}
                  style="primary"
                  className="block w-full"
                  disabled={state == 1}
                >
                  <PlusCircleIcon className="m-0 mr-2 w-6 h-6" />
                  <span>Add recipient</span>
                </Button>
              </td>
            </tr>
          </tbody>
        </table>

        <Codeblock data={codeSnippet} isJson={false} />

        {walletConnected && (
          <Button
            onClick={() => makeTransaction()}
            disabled={state == 1}
            style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
          >
            Run code snippet
          </Button>
        )}

        {result && (
          <>
            <h4>Result</h4>
            <Codeblock data={result} />
          </>
        )}
      </div>
    </div>
  );
}

// function AssetsContainer({
//   index,
//   assets,
//   selectedAssets,
//   toggleSelectedAssets,
//   state,
//   getAssets,
// }) {
//   const { walletConnected } = useWallet();

//   return (
//     <>
//       {walletConnected && assets === null && state === 0 && (
//         <Button onClick={() => getAssets()}>Get wallet assets</Button>
//       )}

//       {assets === null && state === 1 && (
//         <div className="p-4 grid place-content-center" role="status">
//           <svg
//             aria-hidden="true"
//             className="mr-2 w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
//             viewBox="0 0 100 101"
//             fill="none"
//             xmlns="http://www.w3.org/2000/svg"
//           >
//             <path
//               d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
//               fill="currentColor"
//             />
//             <path
//               d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
//               fill="currentFill"
//             />
//           </svg>
//           <span className="sr-only">Loading...</span>
//         </div>
//       )}

//       {assets && assets.length && <p>Select assets to send:</p>}

//       <div className="grid gap-4 lg:grid-cols-3">
//         {assets &&
//           assets.map((asset, i) => {
//             return (
//               <CardAsset
//                 index={index}
//                 asset={asset}
//                 selectedAssets={selectedAssets}
//                 toggleSelectedAssets={toggleSelectedAssets}
//                 key={i}
//               />
//             );
//           })}
//       </div>
//     </>
//   );
// }
