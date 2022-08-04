import { useState } from 'react';
import { Button, Card, Codeblock, Input } from '../../components';
import useWallet from '../../contexts/wallet';
import { PlayIcon } from '@heroicons/react/solid';
import ConnectWallet from '../../components/wallet/connectWallet';
import { WalletService } from '@martifylabs/mesh';
import Link from 'next/link';

export default function WalletApi() {
  return (
    <>
      <DemoGetInstalledWallets />
      <DemoConnectWallet />

      <DemoSection title="Get balance" demoFn="getBalance">
        <p>
          Returns a list of assets in the wallet. This API will return every
          assets in the wallet.
        </p>
      </DemoSection>

      <DemoSection title="Get change address" demoFn="getChangeAddress">
        <p>
          Returns an address owned by the wallet that should be used as a change
          address to return leftover assets during transaction creation back to
          the connected wallet. This can be used as a generic receive address as
          well.
        </p>
      </DemoSection>

      <DemoSection title="Get network ID" demoFn="getNetworkId">
        <p>
          Returns the network ID of the currently connected account. 0 is
          testnet and 1 is mainnet but other networks can possibly be returned
          by wallets. Those other network ID values are not governed by CIP-30.
          This result will stay the same unless the connected account has
          changed.
        </p>
      </DemoSection>

      <DemoSection title="Get reward address" demoFn="getRewardAddresses">
        <p>Returns a list of reward addresses owned by the wallet.</p>
      </DemoSection>

      <DemoSection title="Get used address" demoFn="getUsedAddresses">
        <p>Returns a list of used addresses controlled by the wallet</p>
      </DemoSection>

      <DemoSection title="Get unused address" demoFn="getUnusedAddresses">
        <p>Returns a list of unused addresses controlled by the wallet.</p>
      </DemoSection>

      <DemoSection title="Get UTXOs" demoFn="getUtxos">
        <p>
          Return a list of all UTXOs (unspent transaction outputs) controlled by
          the wallet. ADA balance and multiasset value in each UTXO are
          specified in <code>amount</code>.
        </p>
      </DemoSection>

      <NoDemo
        title="Sign data"
        codeSnippet="const signature = await wallet.signData(payload: string);"
      >
        <p>
          This endpoint utilizes the{' '}
          <a
            href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
            target="_blank"
            rel="noreferrer"
          >
            CIP-8 - Message Signing
          </a>{' '}
          to sign arbitrary data, to verify the data was signed by the owner of
          the private key.
        </p>
      </NoDemo>

      <NoDemo
        title="Sign transaction"
        codeSnippet="const signedTx = await wallet.signTx(tx: string, partialSign = false);"
      >
        <p>
          Requests user to sign the provided transaction. The wallet should ask
          the user for permission, and if given, try to sign the supplied body
          and return a signed transaction. <code>partialSign</code> should be{' '}
          <code>true</code> if the transaction provided requires multiple
          signatures. Check out{' '}
          <Link href="/apis/transaction">Transaction</Link> to learn more on how
          to use this API.
        </p>
      </NoDemo>

      <NoDemo
        title="Submit transaction"
        codeSnippet="const txHash = await wallet.submitTx(tx: string);"
      >
        <p>
          As wallets should already have this ability to submit transaction, we
          allow dApps to request that a transaction be sent through it. If the
          wallet accepts the transaction and tries to send it, it shall return
          the transaction ID for the dApp to track. The wallet can return error
          messages or failure if there was an error in sending it. Check out{' '}
          <Link href="/apis/transaction">Transaction</Link> to learn more on how
          to use this API.
        </p>
      </NoDemo>

      <DemoGetAssets />

      <DemoSection title="Get policy IDs" demoFn="getPolicyIds">
        <p>Return a list of assets&apos; policy ID.</p>
      </DemoSection>

      <DemoGetAssetsCollection />

      <DemoSection title="Get lovelace" demoFn="getLovelace">
        <p>Return the lovelace balance in wallet. 1 ADA = 1000000 lovelace.</p>
      </DemoSection>
    </>
  );
}

function DemoSection({ children, title, demoFn }) {
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
        getAssets: wallet.getAssets(),
        getPolicyIds: wallet.getPolicyIds(),
        getLovelace: wallet.getLovelace(),
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
      <div className="grid2cols">
        <div className="">
          <h3>{title}</h3>
          {children}
        </div>

        <div className="mt-8">
          <div className="flex">
            <div className="flex-1 overflow-auto">
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

function NoDemo({ children, title, codeSnippet }) {
  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>{title}</h3>
          {children}
        </div>
        <div className="mt-8">
          <Codeblock data={codeSnippet} isJson={false} />
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
      <div className="grid2cols">
        <div className="">
          <h3>Get installed wallets</h3>
          <p>Returns a list of wallets installed on user&apos;s device.</p>
        </div>

        <div className="mt-8">
          <div className="flex">
            <div className="flex-1 overflow-auto">
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
  const { walletNameConnected } = useWallet();

  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>Connect wallet</h3>
          <p>
            This is the entrypoint to start communication with the user&apos;s
            wallet. The wallet should request the user&apos;s permission to connect
            the web page to the user&apos;s wallet, and if permission has been
            granted, the wallet will be returned and exposing the full API for
            the dApp to use.
          </p>
          <p>
            Query <code>WalletService.getInstalledWallets()</code> to get a list
            of available wallets, then provide the wallet <code>name</code> for
            which wallet the user would like to connect with.
          </p>
        </div>
        <div className="mt-8">
          <Codeblock
            data={`const wallet = await WalletService.enable("${
              walletNameConnected ? walletNameConnected : 'eternl'
            }");`}
            isJson={false}
          />
          <ConnectWallet />
        </div>
      </div>
    </Card>
  );
}

function DemoGetAssets() {
  const { wallet, walletConnected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [limit, setLimit] = useState<string>('');

  async function runDemo() {
    setLoading(true);
    if (limit.length) {
      let results = await wallet.getAssets();
      setResponse(results);
    } else {
      let results = await wallet.getAssets();
      setResponse(results);
    }
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>Get assets</h3>
          <p>Returns a list of assets in wallet excluding lovelace.</p>
        </div>

        <div className="mt-8">
          <div className="flex">
            <div className="flex-1 overflow-auto">
              <Codeblock
                data={`const result = await wallet.getAssets(${limit});`}
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

function DemoGetAssetsCollection() {
  const { wallet, walletConnected } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [policyId, setPolicyId] = useState<string>('');

  async function runDemo() {
    setLoading(true);
    if (policyId.length) {
      let results = await wallet.getPolicyIdAssets(policyId);
      setResponse(results);
    } else {
      let results = await wallet.getAssets();
      setResponse(results);
    }
    setLoading(false);
  }

  return (
    <Card>
      <div className="grid2cols">
        <div className="">
          <h3>Get a collection of assets</h3>
          <p>
            Returns a list of assets from a policy ID. If no assets in wallet
            belongs to the policy ID, an empty list is returned. Query for a
            list of assets&apos; policy ID with <code>wallet.getPolicyIds()</code>.
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
            </tbody>
          </table>

          <div className="flex">
            <div className="flex-1 overflow-auto">
              <Codeblock
                data={`const result = await wallet.getPolicyIdAssets(${
                  policyId == '' ? '' : '"' + policyId + '"'
                });`}
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
