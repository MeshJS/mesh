import { useState, useEffect } from 'react';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import useWallet from '../../contexts/wallet';
import { PlayIcon } from '@heroicons/react/solid';
import ConnectWallet from '../../components/wallet/connectWallet';
import { WalletService } from '@martifylabs/mesh';

export default function WalletApi() {
  return (
    <>
      <DemoGetInstalledWallets />
      <DemoConnectWallet />

      <DemoSection title="Get balance" desc="Get balance" demoFn="getBalance" />

      <DemoSection
        title="Get change address"
        desc="Get change address"
        demoFn="getChangeAddress"
      />

      <DemoSection
        title="Get network ID"
        desc="Get network ID. 0 is testnet, 1 is mainnet."
        demoFn="getNetworkId"
      />

      <DemoSection
        title="Get reward address"
        desc="Get reward address"
        demoFn="getRewardAddresses"
      />

      <DemoSection
        title="Get used address"
        desc="Get used address"
        demoFn="getUsedAddresses"
      />

      <DemoSection
        title="Get unused address"
        desc="Get unused address"
        demoFn="getUnusedAddresses"
      />

      <DemoSection
        title="Get UTXOs"
        desc="Get wallet's UTXOs"
        demoFn="getUtxos"
      />

      <DemoGetNativeAssets />

      <DemoGetNativeAssetsCollection />

      <DemoSection
        title="Get lovelace"
        desc="Get lovelace balance in wallet."
        demoFn="getLovelaceBalance"
      />
    </>
  );
}

function DemoSection({ title, desc, demoFn }) {
  const { wallet, walletConnected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function callWalletFunctions(fnName) {
    if (wallet) {
      const walletFn = {
        getNetworkId: wallet.getNetworkId(),
        getUtxos: wallet.getUtxos(),
        getBalance: wallet.getBalance(),
        getUsedAddresses: wallet.getUsedAddresses(),
        getUnusedAddresses: wallet.getUnusedAddresses(),
        getChangeAddress: wallet.getChangeAddress(),
        getRewardAddresses: wallet.getRewardAddresses(),
        getNativeAssets: wallet.getNativeAssets(),
        getLovelaceBalance: wallet.getLovelaceBalance(),
      };
      let res = await walletFn[fnName];
      return res;
    }
  }

  async function runDemo() {
    setLoading(true);
    let results = await callWalletFunctions(demoFn);
    setResponse(results);
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>

        <div className="mt-8">
          <div className="flex">
            <div className="grow">
              <Codeblock
                data={`const result = await wallet.${demoFn}();`}
                isJson={false}
              />
            </div>
            <div className="pt-4 ml-1">
              {walletConnected && (
                <Button
                  onClick={() => runDemo()}
                  style={
                    loading
                      ? 'warning'
                      : response !== null
                      ? 'success'
                      : 'light'
                  }
                  disabled={loading}
                >
                  <PlayIcon className="w-4 h-8" />
                </Button>
              )}
            </div>
          </div>
          {response !== null && (
            <>
              <p>
                <b>Result:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function DemoGetInstalledWallets() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

  async function runDemo() {
    setLoading(true);
    let results = WalletService.getInstalledWallets();
    setResponse(results);
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get installed wallets</h3>
          <p>Get a list of wallets available to connect.</p>
        </div>

        <div className="mt-8">
          <div className="flex">
            <div className="grow">
              <Codeblock
                data={`const result = WalletService.getInstalledWallets();`}
                isJson={false}
              />
            </div>
            <div className="pt-4 ml-1">
              <Button
                onClick={() => runDemo()}
                style={
                  loading ? 'warning' : response !== null ? 'success' : 'light'
                }
                disabled={loading}
              >
                <PlayIcon className="w-4 h-8" />
              </Button>
            </div>
          </div>
          {response !== null && (
            <>
              <p>
                <b>Result:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function DemoConnectWallet() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Connect wallet</h3>
          <p>Connect wallet.</p>
        </div>
        <div className="mt-8">
          <Codeblock
            data={`const wallet = await WalletService.enable('eternl');`}
            isJson={false}
          />
          <ConnectWallet />
        </div>
      </div>
    </Card>
  );
}

function DemoGetNativeAssets() {
  const { wallet, walletConnected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [limit, setLimit] = useState<string>('');

  async function runDemo() {
    setLoading(true);
    if (limit) {
      let results = await wallet.getNativeAssets(parseInt(limit));
      setResponse(results);
    } else {
      let results = await wallet.getNativeAssets();
      setResponse(results);
    }
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get native assets</h3>
          <p>
            Get wallet native assets. If not provided will return all native
            assets in wallet.
          </p>
        </div>

        <div className="mt-8">
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Limit</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="limit"
                    type="number"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex">
            <div className="grow">
              <Codeblock
                data={`const result = await wallet.getNativeAssets(${limit});`}
                isJson={false}
              />
            </div>
            <div className="pt-4 ml-1">
              {walletConnected && (
                <Button
                  onClick={() => runDemo()}
                  style={
                    loading
                      ? 'warning'
                      : response !== null
                      ? 'success'
                      : 'light'
                  }
                  disabled={loading}
                >
                  <PlayIcon className="w-4 h-8" />
                </Button>
              )}
            </div>
          </div>
          {response !== null && (
            <>
              <p>
                <b>Result:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function DemoGetNativeAssetsCollection() {
  const { wallet, walletConnected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [policyId, setPolicyId] = useState<string>('');

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getNativeAssetsCollection(policyId);
    setResponse(results);
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get a collection of native assets</h3>
          <p>Get a collection of native assets by policy ID</p>
        </div>

        <div className="mt-8">
          <table className="border border-slate-300 w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              <tr>
                <td className="py-4 px-4 w-1/4">Policy ID</td>
                <td className="py-4 px-4 w-3/4">
                  <Input
                    value={policyId}
                    onChange={(e) => setPolicyId(e.target.value)}
                    placeholder="policyId"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex">
            <div className="grow">
              <Codeblock
                data={`const result = await wallet.getNativeAssetsCollection(${policyId});`}
                isJson={false}
              />
            </div>
            <div className="pt-4 ml-1">
              {walletConnected && (
                <Button
                  onClick={() => runDemo()}
                  style={
                    loading
                      ? 'warning'
                      : response !== null
                      ? 'success'
                      : 'light'
                  }
                  disabled={loading}
                >
                  <PlayIcon className="w-4 h-8" />
                </Button>
              )}
            </div>
          </div>
          {response !== null && (
            <>
              <p>
                <b>Result:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
