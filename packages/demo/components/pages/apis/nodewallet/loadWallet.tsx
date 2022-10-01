import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import { AppWallet, BlockfrostProvider } from '@martifylabs/mesh';
import {
  demoMnemonic,
  demoPrivateKey,
  demoCLIKey,
} from '../../../../configs/demo';
import useAppWallet from '../../../../contexts/AppWallet';
import Input from '../../../ui/input';
import Textarea from '../../../ui/textarea';
import ButtonGroup from '../../../ui/buttongroup';
import FetcherProviderCodeSnippet from '../common/fetcherProvider';

export default function LoadWallet() {
  const [demoMethod, setDemoMethod] = useState<number>(0);
  const [mnemonic, setMnemonic] = useState<string>(
    JSON.stringify(demoMnemonic, null, 2)
  );
  const [network, setNetwork] = useState<number>(0);
  const [privatekey, setPrivatekey] = useState<string>(demoPrivateKey);

  return (
    <SectionTwoCol
      sidebarTo="loadWallet"
      header="Load AppWallet"
      leftFn={Left(mnemonic, network, privatekey)}
      rightFn={Right(
        demoMethod,
        setDemoMethod,
        network,
        setNetwork,
        mnemonic,
        setMnemonic,
        privatekey,
        setPrivatekey
      )}
    />
  );
}

function Left(mnemonic, network, privatekey) {
  let _mnemonic = JSON.stringify(demoMnemonic);
  try {
    _mnemonic = JSON.stringify(JSON.parse(mnemonic));
  } catch (e) {}

  let codeCommon = `import { AppWallet } from '@martifylabs/mesh';\n\n`;

  let code1 = codeCommon;
  code1 += `const wallet = new AppWallet({\n`;
  code1 += `  networkId: ${network},\n`;
  code1 += `  fetcher: fetcherProvider,\n`;
  code1 += `  key: {\n`;
  code1 += `    type: 'mnemonic',\n`;
  code1 += `    words: ${_mnemonic},\n`;
  code1 += `  },\n`;
  code1 += `});\n`;

  let code2 = `const address = wallet.getPaymentAddress();`;

  let code3 = codeCommon;
  code3 += `const wallet = new AppWallet({\n`;
  code3 += `  networkId: ${network},\n`;
  code3 += `  fetcher: fetcherProvider,\n`;
  code3 += `  key: {\n`;
  code3 += `    type: 'root',\n`;
  code3 += `    bech32: '${privatekey}',\n`;
  code3 += `  },\n`;
  code3 += `});\n`;

  let code4 = codeCommon;

  return (
    <>
      <p>
        With Mesh, you can initialize a wallet with <b>mnemonic phrases</b>,{' '}
        <b>private keys</b>, amd <b>CLI generated keys</b>.
      </p>
      <p>Lets import a fetcher provider:</p>
      <FetcherProviderCodeSnippet network={network} />
      <p>Load wallet with mnemonic phrases:</p>
      <Codeblock data={code1} isJson={false} />
      <p>
        With the <code>wallet</code>, you can sign transactions, we will see how
        to do next, you can also get the wallet's address:
      </p>
      <Codeblock data={code2} isJson={false} />
      <p>Load wallet with private keys:</p>
      <Codeblock data={code3} isJson={false} />
      <p>Load wallet with CLI generated keys:</p>
      <Codeblock data={code4} isJson={false} />
    </>
  );
}

function Right(
  demoMethod,
  setDemoMethod,
  network,
  setNetwork,
  mnemonic,
  setMnemonic,
  privatekey,
  setPrivatekey
) {
  const [loading, setLoading] = useState<boolean>(false);
  const { setWallet, setWalletNetwork, setWalletConnected } = useAppWallet();
  const [responseAddress, setResponseAddress] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);

  async function runDemoLoadWallet() {
    setLoading(true);
    setResponseError(null);
    setResponseAddress(null);
    setWalletConnected(false);
    // setWallet(null); // TODO help

    const fetcherProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!,
      network
    );

    if (demoMethod == 0) {
      let _mnemonic = [];
      try {
        _mnemonic = JSON.parse(mnemonic);
      } catch (e) {
        setResponseError('Mnemonic input is not a valid array.');
      }

      try {
        if (_mnemonic.length) {
          const _wallet = new AppWallet({
            networkId: network,
            fetcher: fetcherProvider,
            key: {
              type: 'mnemonic',
              words: _mnemonic,
            },
          });
          setWallet(_wallet);
          setWalletNetwork(network);
          setWalletConnected(true);
          const address = _wallet.getPaymentAddress();
          setResponseAddress(address);
        }
      } catch (error) {
        setResponseError(`${error}`);
      }
    }
    if (demoMethod == 1) {
      try {
        const _wallet = new AppWallet({
          networkId: network,
          fetcher: fetcherProvider,
          key: {
            type: 'root',
            bech32: privatekey,
          },
        });
        setWallet(_wallet);
        setWalletNetwork(network);
        setWalletConnected(true);
        const address = _wallet.getPaymentAddress();
        setResponseAddress(address);
      } catch (error) {
        setResponseError(`${error}`);
      }
    }
    if (demoMethod == 2) {
      try {
        const _wallet = new AppWallet({
          networkId: network,
          fetcher: fetcherProvider,
          key: {
            type: 'cli',
            payment: demoCLIKey.vkey,
            stake: demoCLIKey.skey,
          },
        });
        setWallet(_wallet);
        setWalletNetwork(network);
        setWalletConnected(true);
        const address = _wallet.getPaymentAddress();
        setResponseAddress(address);
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
              label: 'Mnemonic phrases',
              onClick: () => setDemoMethod(0),
            },
            {
              key: 1,
              label: 'Private key',
              onClick: () => setDemoMethod(1),
            },
            {
              key: 2,
              label: 'CLI keys',
              onClick: () => setDemoMethod(2),
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
        />
        <RunDemoButton
          runDemoFn={runDemoLoadWallet}
          loading={loading}
          response={responseAddress}
          label="Load wallet and get address"
        />
        <RunDemoResult response={responseAddress} label="Wallet's address" />

        {responseError !== null && (
          <>
            <p>
              <b>Result:</b>
            </p>
            <Codeblock data={responseError} />
          </>
        )}
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
}) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 m-0">
        <caption className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Load wallet with {demoMethod == 0 && 'mnemonic phrases'}
          {demoMethod == 1 && 'private keys'}
          {demoMethod == 2 && 'CLI generated keys'}
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Provide the {demoMethod == 0 && 'mnemonic phrases'}
            {demoMethod == 1 && 'private keys'}
            {demoMethod == 2 && 'CLI generated keys'} to recover your wallet.
            After initializing the <code>AppWallet</code>, we will get the
            wallet's payment address.
          </p>
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Note: Mesh Playground is safe if you really want to recover your
            Mainnet wallet, but recovering your testing wallet on Mesh
            Playground is recommended.
          </p>
        </caption>
        <tbody>
          <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
            <td>
              {demoMethod == 0 && (
                <>
                  <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
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

              <Input
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
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
