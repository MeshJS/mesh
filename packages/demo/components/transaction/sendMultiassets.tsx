import { useState, useEffect } from 'react';
import Mesh from '@martifylabs/mesh';
import { Button, Card, Codeblock, Input, Modal } from '../../components';
import { Recipient, Asset } from '../../types';
import { CardAsset } from '../blocks/cardassets';
import useWallet from '../../contexts/wallet';

export default function SendMultiassets() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Send multi-assets to another addresses</h3>
          <p>Creating a transaction to send native assets.</p>
        </div>
        <div className="mt-8"></div>
      </div>
      <CodeDemo />
    </Card>
  );
}

function CodeDemo() {
  const { walletConnected } = useWallet();
  const [state, setState] = useState<number>(0);
  const [result, setResult] = useState<null | string>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([
    {
      address: '',
      assets: {},
    },
  ]);
  const [assets, setAssets] = useState<null | Asset[]>(null);
  const [lovelace, setLovelace] = useState<string>('');
  const [selectedAssets, setSelectedAssets] = useState<{}>({});

  async function makeTransaction() {
    setState(1);

    try {
      const tx = await Mesh.transaction.build({
        outputs: recipients,
        blockfrostApiKey:
          (await Mesh.wallet.getNetworkId()) === 1
            ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
            : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
        network: await Mesh.wallet.getNetworkId(),
      });

      const signature = await Mesh.wallet.signTx({ tx });

      const txHash = await Mesh.wallet.submitTransaction({
        tx: tx,
        witnesses: [signature],
      });

      setResult(txHash);
      setState(2);
    } catch (error) {
      setResult(`${error}`);
      setState(0);
    }
  }

  async function getAssets() {
    setState(1);
    await Mesh.blockfrost.init({
      blockfrostApiKey:
        (await Mesh.wallet.getNetworkId()) === 1
          ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
          : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      network: await Mesh.wallet.getNetworkId(),
    });

    const _assets = await Mesh.wallet.getAssets({
      includeOnchain: true,
      limit: 9,
    });
    setAssets(_assets);
    setState(0);
  }

  function toggleSelectedAssets(asset: Asset) {
    let updateSelectedAssets = { ...selectedAssets };
    if (asset.unit in updateSelectedAssets) {
      delete updateSelectedAssets[asset.unit];
    } else {
      updateSelectedAssets[asset.unit] = asset;
    }
    setSelectedAssets(updateSelectedAssets);

    let newRecipients = [...recipients];
    let newAssets = {};
    for (let unit in updateSelectedAssets) {
      newAssets[
        `${updateSelectedAssets[unit].policy}.${updateSelectedAssets[unit].name}`
      ] = 1;
    }
    if (lovelace) {
      newAssets['lovelace'] = parseInt(lovelace);
    }
    newRecipients[0].assets = newAssets;
    setRecipients(newRecipients);
  }

  function updateLovelace(value) {
    setLovelace(value);
    let newRecipients = [...recipients];
    if (value) {
      newRecipients[0].assets['lovelace'] = parseInt(value);
    } else {
      delete newRecipients[0].assets['lovelace'];
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
      getAssets();

      const newRecipents = [
        {
          address:
            (await Mesh.wallet.getNetworkId()) === 1
              ? process.env.NEXT_PUBLIC_TEST_ADDRESS_MAINNET!
              : process.env.NEXT_PUBLIC_TEST_ADDRESS_TESTNET!,
          assets: {},
        },
      ];
      setRecipients(newRecipents);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  return (
    <div className="grid gap-4 grid-cols-2">
      <div>
        {walletConnected && assets === null && state === 0 && (
          <Button onClick={() => getAssets()}>Get wallet assets</Button>
        )}

        {assets === null && state === 1 && (
          <div className="grid place-content-center" role="status">
            <svg
              aria-hidden="true"
              className="mr-2 w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        )}

        <AssetsContainer
          assets={assets}
          selectedAssets={selectedAssets}
          toggleSelectedAssets={toggleSelectedAssets}
        />
      </div>
      <div>
        <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="py-3 px-6">
                Address
              </th>
              <th scope="col" className="py-3 px-6">
                Lovelace
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-4 px-4 w-3/4">
                <Input
                  value={recipients[0].address}
                  onChange={(e) => updateAddress(0, 'address', e.target.value)}
                  placeholder="address"
                />
              </td>
              <td className="py-4 px-4 w-1/4">
                <Input
                  value={lovelace}
                  onChange={(e) => updateLovelace(e.target.value)}
                  placeholder="lovelace"
                  type="number"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <Codeblock
          data={`const recipients = ${JSON.stringify(recipients, null, 2)};

const tx = await Mesh.transaction.build({
  outputs: recipients,
  blockfrostApiKey: "BLOCKFROST_API_KEY",
  network: await Mesh.wallet.getNetworkId(),
});

const signature = await Mesh.wallet.signTx({ tx });

const txHash = await Mesh.wallet.submitTransaction({
  tx: tx,
  witnesses: [signature],
});`}
          isJson={false}
        />

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

function AssetsContainer({ assets, selectedAssets, toggleSelectedAssets }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {assets &&
        assets.map((asset, i) => {
          return (
            <CardAsset
              asset={asset}
              selectedAssets={selectedAssets}
              toggleSelectedAssets={toggleSelectedAssets}
              key={i}
            />
          );
        })}
    </div>
  );
}
