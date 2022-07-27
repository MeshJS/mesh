import { useState, useEffect } from 'react';
import Mesh from '@martifylabs/mesh';
import { Button, Card, Codeblock, Input, Toggle } from '../../components';
import ConnectWallet from '../../components/wallet/connectWallet';

async function callWalletFunctions(fnName) {
  const walletFn = {
    getAvailableWallets: Mesh.wallet.getAvailableWallets(),
    isEnabled: Mesh.wallet.isEnabled(),
    getNetworkId: Mesh.wallet.getNetworkId(),
    getUtxos: Mesh.wallet.getUtxos(),
    getBalance: Mesh.wallet.getBalance(),
    getUsedAddresses: Mesh.wallet.getUsedAddresses(),
    getUnusedAddresses: Mesh.wallet.getUnusedAddresses(),
    getChangeAddress: Mesh.wallet.getChangeAddress(),
    getRewardAddresses: Mesh.wallet.getRewardAddresses(),
    getWalletAddress: Mesh.wallet.getWalletAddress(),
    getLovelace: Mesh.wallet.getLovelace(),
  };
  let res = await walletFn[fnName];
  return res;
}

export default function WalletApi({ walletConnected }) {
  return (
    <>
      <DemoConnectWallet />

      <DemoSection
        title="Get wallets available"
        desc="Get a list of wallets available to connect."
        demoFn={'getAvailableWallets'}
        demoStr={'Mesh.wallet.getAvailableWallets()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Is wallet enabled"
        desc="Check if wallet is enabled."
        demoFn={'isEnabled'}
        demoStr={'Mesh.wallet.isEnabled()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get network ID"
        desc="Get network ID. 0 is testnet, 1 is mainnet."
        demoFn={'getNetworkId'}
        demoStr={'Mesh.wallet.getNetworkId()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get UTXOs"
        desc="Get wallet's UTXOs"
        demoFn={'getUtxos'}
        demoStr={'Mesh.wallet.getUtxos()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get balance"
        desc="Get balance"
        demoFn={'getBalance'}
        demoStr={'Mesh.wallet.getBalance()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get used address"
        desc="Get used address"
        demoFn={'getUsedAddresses'}
        demoStr={'Mesh.wallet.getUsedAddresses()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get unused address"
        desc="Get unused address"
        demoFn={'getUnusedAddresses'}
        demoStr={'Mesh.wallet.getUnusedAddresses()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get change address"
        desc="Get change address"
        demoFn={'getChangeAddress'}
        demoStr={'Mesh.wallet.getChangeAddress()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get reward address"
        desc="Get reward address"
        demoFn={'getRewardAddresses'}
        demoStr={'Mesh.wallet.getRewardAddresses()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get wallet address"
        desc="Get the first used address."
        demoFn={'getWalletAddress'}
        demoStr={'Mesh.wallet.getWalletAddress()'}
        walletConnected={walletConnected}
      />

      <DemoSection
        title="Get lovelace amount"
        desc="Get lovelace amount"
        demoFn={'getLovelace'}
        demoStr={'Mesh.wallet.getLovelace()'}
        walletConnected={walletConnected}
      />

      <DemoAssetParams walletConnected={walletConnected} />
    </>
  );
}

function DemoSection({ title, desc, demoStr, demoFn, walletConnected }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);

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
          <Codeblock data={`const result = await ${demoStr};`} isJson={false} />
          {walletConnected && (
            <Button
              onClick={() => runDemo()}
              style={
                loading ? 'warning' : response !== null ? 'success' : 'light'
              }
              disabled={loading}
            >
              Run code snippet
            </Button>
          )}
          {response !== null && (
            <>
              <p>
                <b>Console:</b>
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
            data={`const walletConnected = await Mesh.wallet.enable({ walletName: "ccvault" });`}
            isJson={false}
          />
          <ConnectWallet />
        </div>
      </div>
    </Card>
  );
}

function DemoAssetParams({ walletConnected }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [policyId, setPolicyId] = useState<string>('');
  const [includeOnchain, setIncludeOnchain] = useState<boolean>(false);
  const [limit, setLimit] = useState<string>('9');
  const [network, setNetwork] = useState<number>(0);

  async function runDemo() {
    setLoading(true);
    await Mesh.blockfrost.init({
      blockfrostApiKey:
        network === 1
          ? process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET!
          : process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      network: network,
    });

    let params = {
      policyId: policyId,
      includeOnchain: includeOnchain,
    };
    if (limit) {
      let _limit = parseInt(limit);
      if (_limit > 0) {
        params['limit'] = _limit;
      }
    }

    const res = await Mesh.wallet.getAssets(params);
    setResponse(res);
    setLoading(false);
  }

  let hasParams = false;
  let codeSnippet = ``;
  if (policyId) {
    hasParams = true;
    codeSnippet += policyId && `  policyId: "${policyId}",\n`;
  }
  if (includeOnchain) {
    hasParams = true;
    codeSnippet += `  includeOnchain: ${includeOnchain},\n`;
  }
  if (limit) {
    let _limit = parseInt(limit);
    if (_limit > 0) {
      hasParams = true;
      codeSnippet += `  limit: ${limit},\n`;
    }
  }
  if (hasParams) {
    codeSnippet = `const result = await Mesh.wallet.getAssets({\n${codeSnippet}});`;
  } else {
    codeSnippet = `const result = await Mesh.wallet.getAssets();`;
  }

  if (includeOnchain) {
    codeSnippet =
      `await Mesh.blockfrost.init({\n  blockfrostApiKey: "BLOCKFROST_API_KEY",\n  network: await Mesh.wallet.getNetworkId(),\n});\n\n` +
      codeSnippet;
  }

  useEffect(() => {
    async function init() {
      let network = await Mesh.wallet.getNetworkId();
      setNetwork(network);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Get assets</h3>
          <p>
            Get assets, filtered by policy ID and query on-chain information.
          </p>
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
              <tr>
                <td className="py-4 px-4 w-1/4">
                  Include on-chain information
                </td>
                <td className="py-4 px-4 w-3/4">
                  <Toggle value={includeOnchain} onChange={setIncludeOnchain} />
                </td>
              </tr>
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

          <Codeblock data={codeSnippet} isJson={false} />
          {walletConnected && (
            <Button
              onClick={() => runDemo()}
              style={
                loading ? 'warning' : response !== null ? 'success' : 'light'
              }
              disabled={loading}
            >
              Run code snippet
            </Button>
          )}
          {response !== null && (
            <>
              <p>
                <b>Console:</b>
              </p>
              <Codeblock data={response} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
