import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import ButtonGroup from "~/components/button/button-group";
import RunDemoButton from "~/components/button/run-demo-button";
import Card from "~/components/card/card";
import ProviderCodeSnippet from "~/components/cardano/blockchain-providers-code-snippet";
import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import Textarea from "~/components/form/textarea";
import DemoResult from "~/components/sections/demo-result";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";
import {
  demoAddresses,
  demoCLIKey,
  demoMnemonic,
  demoPrivateKey,
} from "~/data/cardano";

export default function MeshWalletLoadWallet() {
  const [demoMethod, setDemoMethod] = useState<number>(0);
  const [mnemonic, setMnemonic] = useState<string>(
    JSON.stringify(demoMnemonic, null, 2),
  );
  const [network, setNetwork] = useState<number>(0);
  const [privatekey, setPrivatekey] = useState<string>(demoPrivateKey);
  const [paymentSkey, setPaymentSkey] = useState<string>(
    demoCLIKey.paymentSkey,
  );
  const [stakeSkey, setStakeSkey] = useState<string>(demoCLIKey.stakeSkey);
  const [walletAddress, setWalletAddress] = useState<string>(
    demoAddresses.testnetPayment,
  );

  return (
    <TwoColumnsScroll
      sidebarTo="initWallet"
      title="Initialize wallet"
      leftSection={Left(
        mnemonic,
        network,
        privatekey,
        paymentSkey,
        stakeSkey,
        walletAddress,
      )}
      rightSection={Right(
        demoMethod,
        setDemoMethod,
        network,
        setNetwork,
        mnemonic,
        setMnemonic,
        privatekey,
        setPrivatekey,
        paymentSkey,
        setPaymentSkey,
        stakeSkey,
        setStakeSkey,
        walletAddress,
        setWalletAddress,
      )}
    />
  );
}

function Left(
  mnemonic: string,
  network: number,
  privatekey: string,
  paymentSkey: string,
  stakeSkey: string,
  walletAddress: string,
) {
  let _mnemonic = JSON.stringify(demoMnemonic);
  try {
    _mnemonic = JSON.stringify(JSON.parse(mnemonic));
  } catch (e) {}

  let codeCommon = `import { MeshWallet } from '@meshsdk/core';\n\n`;

  let code1 = codeCommon;
  code1 += `const wallet = new MeshWallet({\n`;
  code1 += `  networkId: ${network}, // 0: testnet, 1: mainnet\n`;
  code1 += `  fetcher: provider,\n`;
  code1 += `  submitter: provider,\n`;
  code1 += `  key: {\n`;
  code1 += `    type: 'mnemonic',\n`;
  code1 += `    words: ${_mnemonic},\n`;
  code1 += `  },\n`;
  code1 += `});\n`;

  let code2 = `const address = wallet.getChangeAddress();`;

  let code3 = codeCommon;
  code3 += `const wallet = new MeshWallet({\n`;
  code3 += `  networkId: ${network}, // 0: testnet, 1: mainnet\n`;
  code3 += `  fetcher: provider,\n`;
  code3 += `  submitter: provider,\n`;
  code3 += `  key: {\n`;
  code3 += `    type: 'root',\n`;
  code3 += `    bech32: '${privatekey}',\n`;
  code3 += `  },\n`;
  code3 += `});\n`;

  let code4 = codeCommon;
  code4 += `const wallet = new MeshWallet({\n`;
  code4 += `  networkId: ${network}, // 0: testnet, 1: mainnet\n`;
  code4 += `  fetcher: provider,\n`;
  code4 += `  submitter: provider,\n`;
  code4 += `  key: {\n`;
  code4 += `    type: 'cli',\n`;
  code4 += `    payment: '${paymentSkey}',\n`;
  if (stakeSkey && stakeSkey.length) {
    code4 += `    stake: '${stakeSkey}',\n`;
  }
  code4 += `  },\n`;
  code4 += `});\n`;

  let code5 = codeCommon;
  code5 += `const wallet = new MeshWallet({\n`;
  code5 += `  networkId: ${network}, // 0: testnet, 1: mainnet\n`;
  code5 += `  fetcher: provider,\n`;
  code5 += `  key: {\n`;
  code5 += `    type: 'address',\n`;
  code5 += `    address: '${walletAddress}',\n`;
  code5 += `  },\n`;
  code5 += `});\n`;

  return (
    <>
      <p>You can initialize Mesh Wallet with:</p>
      <ul>
        <li>mnemonic phrases</li>
        <li>private keys</li>
        <li>Cardano CLI generated keys</li>
        <li>address (read only wallet)</li>
      </ul>

      <p>
        First, we initialize a Provider, which we will assign <>provider</> to
        the <code>fetcher</code> and <code>submitter</code>.
      </p>
      <ProviderCodeSnippet />

      <h3>Mnemonic phrases</h3>
      <p>We can load wallet with mnemonic phrases:</p>
      <Codeblock data={code1} />
      <p>
        With the <code>wallet</code> loaded, you can sign transactions, we will
        see how to do this in the next section, for now lets get the wallet's
        address:
      </p>
      <Codeblock data={code2} />

      <h3>Private keys</h3>
      <p>We can load wallet with private keys:</p>
      <Codeblock data={code3} />

      <h3>Cardano CLI generated skeys</h3>
      <p>
        We can load wallet with CLI generated keys by providing the{" "}
        <code>skey</code> generated by Cardano CLI. There are two files
        generated by Cardano CLI, by default it is named{" "}
        <code>signing.skey</code> and <code>stake.skey</code>. Opening the{" "}
        <code>signing.skey</code> file it should contains:
      </p>
      <Codeblock
        data={`{\n  "type": "PaymentSigningKeyShelley_ed25519",\n  "description": "Payment Signing Key",\n  "cborHex": "${demoCLIKey.paymentSkey}"\n}`}
        isJson={false}
      />

      <p>
        We can get the <code>cborHex</code> from the <code>signing.skey</code>{" "}
        file, and load wallet with Cardano CLI generated skeys. Stake key is
        optional, but without it, you cannot sign staking transactions.
      </p>
      <Codeblock data={code4} />

      <h3>Address</h3>
      <p>
        We can load wallet with address, this is useful for read-only wallets. A
        read-only wallet can only query the blockchain, it cannot sign
        transactions. This is useful for monitoring wallets. We can load wallet
        with the <code>address</code> type:
      </p>
      <Codeblock data={code5} />

      <h3>Initialize wallet</h3>
      <p>
        After creating the wallet, we need to initialize it. This will
        initialize the cryptography library.
      </p>
      <Codeblock data={`await wallet.init()`} />

      <p>
        With the <code>wallet</code> loaded, you can sign transactions, we will
        see how to do this in the next section, for now lets get the wallet's
        address:
      </p>
      <Codeblock data={code2} />
    </>
  );
}

function Right(
  demoMethod: number,
  setDemoMethod: (demoMethod: number) => void,
  network: number,
  setNetwork: (network: number) => void,
  mnemonic: string,
  setMnemonic: (mnemonic: string) => void,
  privatekey: string,
  setPrivatekey: (privatekey: string) => void,
  paymentSkey: string,
  setPaymentSkey: (paymentSkey: string) => void,
  stakeSkey: string,
  setStakeSkey: (stakeSkey: string) => void,
  walletAddress: string,
  setWalletAddress: (address: string) => void,
) {
  const { setWallet } = useMeshWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [responseAddress, setResponseAddress] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemoLoadWallet() {
    setLoading(true);
    setResponseError(null);
    setResponseAddress(null);

    const provider = getProvider();

    if (demoMethod == 0) {
      let _mnemonic = [];
      try {
        _mnemonic = JSON.parse(mnemonic);
      } catch (e) {
        setResponseError("Mnemonic input is not a valid array.");
      }

      try {
        if (_mnemonic.length) {
          const _wallet = new MeshWallet({
            networkId: network as 0 | 1,
            fetcher: provider,
            submitter: provider,
            key: {
              type: "mnemonic",
              words: _mnemonic,
            },
          });
          await _wallet.init();
          setWallet(_wallet);

          const changeAddress = await _wallet.getChangeAddress();
          setResponseAddress(changeAddress);
        }
      } catch (error) {
        setResponseError(`${error}`);
      }
    }
    if (demoMethod == 1) {
      try {
        const _wallet = new MeshWallet({
          networkId: network as 0 | 1,
          fetcher: provider,
          submitter: provider,
          key: {
            type: "root",
            bech32: privatekey,
          },
        });
        await _wallet.init();
        setWallet(_wallet);

        const changeAddress = await _wallet.getChangeAddress();
        setResponseAddress(changeAddress);
      } catch (error) {
        setResponseError(`${error}`);
      }
    }
    if (demoMethod == 2) {
      try {
        const stake = stakeSkey?.length > 0 ? stakeSkey : undefined;
        const _wallet = new MeshWallet({
          networkId: network as 0 | 1,
          fetcher: provider,
          submitter: provider,
          key: {
            type: "cli",
            payment: paymentSkey,
            stake,
          },
        });
        await _wallet.init();
        setWallet(_wallet);

        const changeAddress = await _wallet.getChangeAddress();
        setResponseAddress(changeAddress);
      } catch (error) {
        setResponseError(`${error}`);
      }
    }
    if (demoMethod == 3) {
      try {
        const _wallet = new MeshWallet({
          networkId: network as 0 | 1,
          fetcher: provider,
          submitter: provider,
          key: {
            type: "address",
            address: walletAddress,
          },
        });
        await _wallet.init();
        setWallet(_wallet);

        const changeAddress = await _wallet.getChangeAddress();
        setResponseAddress(changeAddress);
      } catch (error) {
        setResponseError(`${error}`);
      }
    }

    setLoading(false);
  }

  return (
    <>
      <Card>
        <ButtonGroup
          items={[
            {
              key: 0,
              label: "Mnemonic",
              onClick: () => setDemoMethod(0),
            },
            {
              key: 1,
              label: "Private key",
              onClick: () => setDemoMethod(1),
            },
            {
              key: 2,
              label: "CLI keys",
              onClick: () => setDemoMethod(2),
            },
            {
              key: 3,
              label: "Address",
              onClick: () => setDemoMethod(3),
            },
          ]}
          currentSelected={demoMethod}
        />

        <InputTable
          demoMethod={demoMethod}
          network={network}
          setNetwork={setNetwork}
          mnemonic={mnemonic}
          setMnemonic={setMnemonic}
          privatekey={privatekey}
          setPrivatekey={setPrivatekey}
          paymentSkey={paymentSkey}
          setPaymentSkey={setPaymentSkey}
          stakeSkey={stakeSkey}
          setStakeSkey={setStakeSkey}
          walletAddress={walletAddress}
          setWalletAddress={setWalletAddress}
        />
        <RunDemoButton
          runFunction={runDemoLoadWallet}
          loading={loading}
          response={responseAddress}
          label="Load wallet and get address"
        />
        <DemoResult response={responseAddress} label="Wallet's addresses" />
        <DemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}

function InputTable({
  demoMethod,
  network,
  setNetwork,
  mnemonic,
  setMnemonic,
  privatekey,
  setPrivatekey,
  paymentSkey,
  setPaymentSkey,
  stakeSkey,
  setStakeSkey,
  walletAddress,
  setWalletAddress,
}: {
  demoMethod: number;
  network: number;
  setNetwork: (network: number) => void;
  mnemonic: string;
  setMnemonic: (mnemonic: string) => void;
  privatekey: string;
  setPrivatekey: (privatekey: string) => void;
  paymentSkey: string;
  setPaymentSkey: (paymentSkey: string) => void;
  stakeSkey: string;
  setStakeSkey: (stakeSkey: string) => void;
  walletAddress: string;
  setWalletAddress: (address: string) => void;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="m-0 w-full text-left text-sm text-neutral-500 dark:text-neutral-400">
        <caption className="bg-white p-5 text-left text-lg font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white">
          Load wallet with {demoMethod == 0 && "mnemonic phrases"}
          {demoMethod == 1 && "private keys"}
          {demoMethod == 2 && "CLI generated keys"}
          {demoMethod == 3 && "address"}
          <p className="mt-1 text-sm font-normal text-neutral-500 dark:text-neutral-400">
            Provide the {demoMethod == 0 && "mnemonic phrases"}
            {demoMethod == 1 && "private keys"}
            {demoMethod == 2 && "CLI generated keys"}
            {demoMethod == 3 && "address"} to recover your wallet. After
            initializing the <code>MeshWallet</code>, we will get the wallet's
            payment address.
          </p>
          <p className="mt-1 text-sm font-normal text-neutral-500 dark:text-neutral-400">
            Note: Trying these demo with your Testnet wallet is recommended.
          </p>
        </caption>
        <tbody>
          <tr className="border-b bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <td>
              {demoMethod == 0 && (
                <>
                  <label className="mb-2 block text-sm font-medium text-neutral-900 dark:text-white">
                    Mnemonic phrases
                  </label>
                  <Textarea
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    rows={8}
                  />
                </>
              )}
              {demoMethod == 1 && (
                <Input
                  value={privatekey}
                  onChange={(e) => setPrivatekey(e.target.value)}
                  placeholder="Private key"
                  label="Private key"
                />
              )}
              {demoMethod == 2 && (
                <>
                  <Input
                    value={paymentSkey}
                    onChange={(e) => setPaymentSkey(e.target.value)}
                    placeholder="Payment signing key"
                    label="Payment signing key"
                  />
                  <Input
                    value={stakeSkey}
                    onChange={(e) => setStakeSkey(e.target.value)}
                    placeholder="Stake signing key (optional)"
                    label="Stake signing key (optional)"
                  />
                </>
              )}
              {demoMethod == 3 && (
                <Input
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Wallet address"
                  label="Wallet address"
                />
              )}
              <Input
                value={network}
                onChange={(e) => setNetwork(parseInt(e.target.value))}
                placeholder="Network"
                label="Network"
                type="number"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
