import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideNextjsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'System setup', to: 'systemsetup' },
    { label: 'Setup Next.js', to: 'setupnextjs' },
    { label: 'Setup Mesh', to: 'setupmesh' },
    { label: 'Add a wallet connection', to: 'addawalletconnection' },
    { label: 'Integrate your Smart Contract', to: 'integrateSC' },
  ];

  return (
    <>
      <Metatags
        title="Use your Smart Contract with Mesh"
        description="A step-by-step guide to integrate your Cardano Smart Contract to a web application."
        image="https://mesh.martify.io/guides/nextjs.png"
      />
      <GuidesLayout
        title="Use your Smart Contract with Mesh"
        desc="A step-by-step guide to integrate your Cardano Smart Contract to a web application."
        sidebarItems={sidebarItems}
        image="/guides/blockchain.jpg"
      >
        <p>
          Cardano introduced smart contract support in 2021 which allowed the creation of a number of decentralised applications. However the
          knowledge required to develop such an app is very extensive and might be frightening for new developers or companies looking to 
          build on Cardano. Mesh aims to solve this problem and here we are providing users with a comprehensive guide to facilitate their 
          approach to Cardano development.
        </p>
        <p>
          Next.js and Mesh are JavaScript libraries, and so we will assume that
          you have some familiarity with HTML and JavaScript language, but you
          should be able to follow along even if you are coming from a different
          programming language. If you don't feel very confident, we recommend
          going through this{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/A_re-introduction_to_JavaScript"
            target="_blank"
            rel="noreferrer"
          >
            JS tutorial
          </a>
          , or the{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"
            target="_blank"
            rel="noreferrer"
          >
            MDN JavaScript Reference
          </a>{' '}
          or my preferred method, by watching a few{' '}
          <a
            href="https://www.youtube.com/results?search_query=get+started+with+nextjs"
            target="_blank"
            rel="noreferrer"
          >
            videos from YouTube
          </a>
          .
        </p>
        <p>To follow this guide you will also need a compiled Plutus Smart Contract, specifically its CBOR representation.
           If you are not familiar whit this, we will soon be providing 
          pre-built contracts for the most popular use cases.
        </p>

        <Element name="systemsetup">
          <h2>System setup</h2>

          <h3>1. Visual Studio Code</h3>
          <p>
            Visual Studio Code is a code editor made by Microsoft. Download and
            install{' '}
            <a
              href="https://code.visualstudio.com/"
              target="_blank"
              rel="noreferrer"
            >
              Visual Studio Code
            </a>{' '}
            for code editing.
          </p>

          <h3>2. Node.js</h3>
          <p>
            Node.js is a cross-platform JavaScript runtime environment that runs
            on the V8 engine and executes JavaScript code. Install the Long-Term
            Support (LTS) version of{' '}
            <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
              Node.js
            </a>{' '}
            (as of writing v16.16.0).
          </p>

          <h3>3. Yarn</h3>
          <p>
            Yarn is a software packaging system developed for the Node.js
            JavaScript runtime environment. Install Yarn through the npm package
            manager, which comes bundled with Node.js when you install it on
            your system. Run this command on your system Terminal:
          </p>
          <Codeblock data={`npm install --global yarn`} isJson={false} />
        </Element>

        <Element name="setupnextjs">
          <h2>Setup Next.js</h2>
          <h3>1. Create project folder and open Visual Studio Code</h3>
          <p>
            Create a new folder for your project, and give the folder a
            meaningful name. Open the Visual Studio Code application and drag
            your project folder into Visual Studio Code.
          </p>

          <h3>2. Create Next.js app</h3>
          <p>
            From the menu options in on your Visual Studio Code, open the{' '}
            <code>Terminal</code> and execute this command to create a new
            NextJs application:
          </p>
          <Codeblock
            data={`yarn create next-app --typescript .`}
            isJson={false}
          />

          <h3>3. Start development server</h3>
          <p>
            After the installation is complete, start the development server
            with:
          </p>
          <Codeblock data={`yarn run dev`} isJson={false} />
          <p>
            Visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            to view your application. <code>CTRL+C</code> to stop the
            application.
          </p>
        </Element>

        <Element name="setupmesh">
          <h2>Setup Mesh</h2>
          <h3>1. Install @martifylabs/mesh package</h3>
          <p>Install the latest version of Mesh with yarn:</p>
          <Codeblock data={`yarn add @martifylabs/mesh`} isJson={false} />

          <h3>
            2. Add webpack in <code>next.config.js</code>
          </h3>
          <p>
            Open <code>next.config.js</code> and append <code>webpack</code>{' '}
            configurations. Your <code>next.config.js</code> should look like
            this:
          </p>
          <Codeblock
            data={`/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
    };
    return config;
  },
};
module.exports = nextConfig;
`}
            isJson={false}
          />
          <h3>3. Congratulations</h3>
          <p>
            You just saved a few weeks of learning and several days trying to
            get started. Your Next.js application is ready to accept wallet connections,
            browse assets and make some transactions.
          </p>
        </Element>

        <Element name="addawalletconnection">
          <h2>Add a wallet connection</h2>
          <h3>1. Create a wallet context</h3>
          <p>
            React context is an essential tool for building web applications. It
            allow you to easily share state in your applications, so you can use
            the data in any component within the app. This means that when the
            user has connected their wallet, visiting different pages on the app
            ensure their wallet is still connected.
          </p>
          <p>
            Create a new folder named <code>contexts</code> and create a new
            file named <code>wallet.tsx</code>. Open{' '}
            <code>contexts/wallet.tsx</code> and insert the following codes:
          </p>
          <Codeblock
            data={`import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { BrowserWallet } from "@martifylabs/mesh";

const WalletContext = createContext({
  wallet: {} as BrowserWallet,
  connecting: false,
  walletNameConnected: "",
  walletConnected: false,
  connectWallet: async (walletName: string) => {},
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<BrowserWallet>({} as BrowserWallet);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>("");

  const connectWallet = async (walletName: string) => {
    setConnecting(true);
    const _wallet = await BrowserWallet.enable(walletName);
    if (_wallet) {
      setWallet(_wallet);
      setWalletNameConnected(walletName);
      setWalletConnected(true);
    }
    setConnecting(false);
  };

  const memoedValue = useMemo(
    () => ({
      wallet,
      connecting,
      walletNameConnected,
      walletConnected,
      connectWallet,
    }),
    [wallet, walletConnected, connecting, walletNameConnected]
  );

  return (
    <WalletContext.Provider value={memoedValue}>
      {children}
    </WalletContext.Provider>
  );
};

export default function useWallet() {
  return useContext(WalletContext);
}`}
            isJson={false}
          />

          <p>
            Open <code>pages/_app.tsx</code> and include the{' '}
            <code>WalletProvider</code>. Your <code>_app.tsx</code> should look
            similar to this:
          </p>
          <Codeblock
            data={`import "../styles/globals.css";
import type { AppProps } from "next/app";
import { WalletProvider } from "../contexts/wallet";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <Component {...pageProps} />
    </WalletProvider>
  );
}

export default MyApp;`}
            isJson={false}
          />

          <h3>2. Create a connect wallet component</h3>
          <p>
            Lets create a connect wallet component to show users a few buttons
            to connect wallets they have installed on their device. Clicking on
            these buttons will ask the user for permission if not granted, and
            proceed to connect the selected wallet. We will use the{' '}
            <code>useWallet</code> we have previously created for connecting
            wallet and maintaining states.
          </p>
          <p>
            Create a new folder named <code>components</code> and create a new
            file named <code>connectWallet.tsx</code>. Open{' '}
            <code>components/connectWallet.tsx</code> and insert the following
            codes:
          </p>
          <Codeblock
            data={`import { useEffect, useState } from "react";
import { BrowserWallet } from "@martifylabs/mesh";
import type { Wallet } from "@martifylabs/mesh";
import useWallet from "../contexts/wallet";

export default function ConnectWallet() {
  const [availableWallets, setAvailableWallets] = useState<
    Wallet[] | undefined
  >(undefined);
  const { walletNameConnected, connecting, connectWallet, walletConnected } =
    useWallet();

  useEffect(() => {
    async function init() {
      setAvailableWallets(BrowserWallet.getInstalledWallets());
    }
    init();
  }, []);

  return (
    <>
      {availableWallets
        ? availableWallets.length == 0
          ? "No wallets found"
          : availableWallets.map((wallet, i) => (
              <button
                key={i}
                onClick={() => connectWallet(wallet.name)}
                disabled={
                  walletConnected ||
                  connecting ||
                  walletNameConnected == wallet.name
                }
                style={{
                  fontWeight:
                    walletNameConnected == wallet.name ? "bold" : "normal",
                  margin: "8px",
                  backgroundColor:
                    walletNameConnected == wallet.name
                      ? "green"
                      : connecting
                      ? "orange"
                      : "grey",
                }}
              >
                <img
                  src={wallet.icon}
                  style={{
                    width: "40px",
                    height: "40px",
                  }}
                />
                Connect with {wallet.name}
              </button>
            ))
        : ""}
    </>
  );
}`}
            isJson={false}
          />
          <h3>3. Lets connect a wallet</h3>
          <p>
            Lastly, we link those components together, allowing users to choose
            a wallet to connect.
          </p>
          <p>
            Open <code>pages/index.tsx</code> and replace it with the following
            codes:
          </p>
          <Codeblock
            data={`import { useState } from "react";
import type { NextPage } from "next";
import useWallet from "../contexts/wallet";
import ConnectWallet from "../components/connectWallet";

const Home: NextPage = () => {
  const { wallet, walletConnected, connecting } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <div>
      <h1>Connect Wallet</h1>
      <ConnectWallet />
    </div>
  );
};

export default Home;`}
            isJson={false}
          />

          <p>Start the development server and try it:</p>
          <Codeblock data={`yarn run dev`} isJson={false} />
          <p>
            Visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            to connect available wallets.
          </p>
          <p>You now have working wallet connection component. Users can now navigate to your website and succesfully
             connect their browser wallet.</p>
        </Element>

        <Element name="integrateSC">
          <h2>Integrate your Smart Contract</h2>
          <h3>1. Add your Plutus compiled code to the project</h3>
          <p>
            Here we will need the compiled version of your Plutus Smart Contract. If you don't have any or don't know what this is, Mesh will
            soon provide a selection of pre-built Smart Contracts that cover the most popular use cases.
          </p>
          <p>
            Create a new folder named <code>config</code> and in it create a new
            file named <code>contract.ts</code>. Open it and insert the following code:
          </p>
          <Codeblock
            data={`import { PlutusScript, resolvePlutusScriptAddress } from '@martifylabs/mesh';

export const script: PlutusScript = {
    code: '<Put your CBOR here>',
    version: '<V1 or V2>',
};

export const scriptAddr = resolvePlutusScriptAddress(script, 1);`}
            isJson={false}
          />
          <p>Note that here we use a Mesh resolver to get the address of the script. The resolver{' '}
             <code>resolvePlutusScriptAddress</code> takes two arguments: a PlutusScript and an integer representing the Network Id. 
             Here we use the pre-production network that has an Id of {' '}<code>1</code>, but feel free to change it according to your needs.
             For more information see <a href="https://mesh.martify.io/apis/resolvers">Resolvers</a>.
          </p>
          

          <h3>2. See your Contract in action - Lock funds</h3>
          <p>
            Now that we successfully imported our contract to the project, we can start using it in our web application.
          </p>
          <p>
            Open <code>pages/index.tsx</code> and add the following two imports at the top of your file:
          </p>
          <Codeblock
            data={`import { script, scriptAddr } from "../config/contract";
import { Transaction, Data, BlockfrostProvider, resolveDataHash } from '@martifylabs/mesh';`}
            isJson={false}
          />
          <p>Now we will use the Mesh transaction builder to build the locking transaction. Depending on your contract you 
            will probably need to modify the value and datum fields, here we will be locking one NFT with a datum containing a simple integer.
          </p>
          <p>Add the following function to your <code>pages/index.tsx</code> file, right before the <code>return</code> part.</p>
          <Codeblock
            data={`async function lockFunds() {
  if (wallet) {
    const addr = (await wallet.getUsedAddresses())[0];
    const d: Data = 42;
    const tx = new Transaction({ initiator: wallet })
      .sendAssets(
        {
          address: scriptAddr,
          datum: {
            value: d,
          },
        },
        [
          {
            unit: "<policyId+hexTokenName>",
            quantity: "1",
          },
        ],
      );
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
  }
};`}
            isJson={false}
          />
          <p>Now replace the <code>return</code> function with the following</p>
          <Codeblock
            data={`return (
  <div>
    <h1>Connect Wallet</h1>
    <ConnectWallet />
    {walletConnected && (
      <>
        <h1>Lock funds in your Contract</h1>
        
          <button
            type="button"
            onClick={() => lockFunds()}
            disabled={connecting || loading}
            style={{
              margin: "8px",
              backgroundColor: connecting || loading ? "orange" : "grey",
            }}
          >
            Lock funds
          </button>
        
      </>
    )}
  </div>
);`}      
          isJson={false}
          />
          <p>
            Visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            to lock some funds.
          </p>

          <p>We've now successfully locked an NFT in our script with a datum of value '42'. If you want to learn how to build 
            more complex datum structures, check out{' '}
            <a href="https://mesh.martify.io/apis/transaction">APIs - Transaction</a> docs in the<code>Designing datum</code> section.
          </p>

          <h3>3. See your Contract in action - Unlock funds</h3>
          <p>After successfully locking some funds, now it's time to unlock them. Here, in addition to the datum, we will need to construct
            a redeemer. In this example we will use a simple integer, but feel free to modify it in accordance to what your contract requires.
          </p>
          <p>First let's fetch data from the blockchain at the script address to get the exact UTxO we are trying to spend. For this we will use 
            <code>BlockfrostProvider</code>, but you can use any provider that Mesh supports, see{' '}
            <a href="https://mesh.martify.io/apis/providers">Providers</a>.
          </p>            
          <p>Paste the following function right before your<code>return</code> section</p>
          <Codeblock
            data={`async function _getAssetUtxo({scriptAddress, asset, datum}) {
  const blockfrostProvider = new BlockfrostProvider(
    '<blockfrostApiKey>',
  );
  const utxos = await blockfrostProvider.fetchAddressUtxos(
    scriptAddress,
    asset
  );
  const dataHash = resolveDataHash(datum);
  let utxo = utxos.find((utxo: any) => {
    return utxo.output.dataHash == dataHash;
  });
  return utxo;
};`}      
          isJson={false}
          />
          <p>Now we can build our unlocking transaction, paste the following function right before your <code>return</code> section.
          Make sure to construct the same datum you used when locking the funds.</p>
          <Codeblock
            data={`async function unlockFunds() {
  if (wallet) {
    setLoading(true);
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = 42;
    const redeemer = 21;
    
    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddr, 
      asset: '<policyId+hexTokenName>',
      datum: datumConstr,
    });

    const tx = new Transaction({ initiator: wallet })
      .redeemValue({
        value: assetUtxo,
        script: script,
        datum: datumConstr,
        redeemer: redeemer,
      })
      .sendValue({ address: addr }, assetUtxo)
      .setRequiredSigners([addr]);
    
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    setLoading(false);
  }
};`}      
          isJson={false}
          />
          <p>Finally, let's change the <code>return</code> function once more, to make it unlock funds this time.
          Replace it with the following code</p>
          <Codeblock
            data={`return (
  <div>
    <h1>Connect Wallet</h1>
    <ConnectWallet />
    {walletConnected && (
      <>
        <h1>Unlock your funds from your Contract</h1>
        
          <button
            type="button"
            onClick={() => unlockFunds()}
            disabled={connecting || loading}
            style={{
              margin: "8px",
              backgroundColor: connecting || loading ? "orange" : "grey",
            }}
          >
            Unlock funds
          </button>
        
      </>
    )}
  </div>
);`}      
          isJson={false}
          />
          <p>
            Visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            and unlock your funds.
          </p>

          <h3>4. Explore further</h3>
          <p>Congratulations, you've succesfully integrated your Smart Contract to a web application!</p>
          <p>Now you may want to explore more complex datum/redeemer structures, V2 features, Plutus minting and more. 
             Mesh supports each of these features and we are continuously working on adding more guides and expanding the docs.
             If you have any issues please report them in our <a href="https://discord.gg/Z6AH9dahdH">Discord</a> server or open
              an issue on <a href="https://github.com/MartifyLabs/mesh">Mesh's Github page</a>. </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
