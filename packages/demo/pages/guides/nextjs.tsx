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
    { label: 'See it in action', to: 'seeitinaction' },
  ];

  return (
    <>
      <Metatags
        title="Start a Web3 app on Next.js"
        description="A step-by-step guide to setup a Next.js web application, connect wallet and browse wallet's assets."
        image="https://mesh.martify.io/guides/nextjs.png"
      />
      <GuidesLayout
        title="Start a Web3 app on Next.js"
        desc="A step-by-step guide to setup a Next.js web application, connect
    wallet and browse wallet's assets."
        sidebarItems={sidebarItems}
        image="/guides/laptop-g44c60b4ed_1280.jpg"
      >
        <p>
          <a href="https://nextjs.org/" target="_blank" rel="noreferrer">
            Next.js
          </a>{' '}
          is a web development framework built on top of Node.js enabling
          React-based web applications functionalities such as server-side
          rendering and generating static websites.
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
          or my preferred method, by watch a few{' '}
          <a
            href="https://www.youtube.com/results?search_query=get+started+with+nextjs"
            target="_blank"
            rel="noreferrer"
          >
            videos from YouTube
          </a>
          .
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
            You just saved a few weeks of learning and a number days trying to
            get started. Your Next.js application is ready to connect wallet,
            browse assets and make some transactions.
          </p>
        </Element>

        <Element name="seeitinaction">
          <h2>See it in action</h2>
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

          <h3>3. Lets connect wallet and check wallet&apos;s assets</h3>
          <p>
            Lastly, we link those components together, allowing users to choose
            a wallet to connect, and query for assets in the wallet with{' '}
            <code>wallet.getAssets()</code>.
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
  const [assets, setAssets] = useState<null | any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  async function getAssets() {
    if (wallet) {
      setLoading(true);
      const _assets = await wallet.getAssets();
      setAssets(_assets);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Connect Wallet</h1>
      <ConnectWallet />
      {walletConnected && (
        <>
          <h1>Get Wallet Assets</h1>
          {assets ? (
            <pre>
              <code className="language-js">
                {JSON.stringify(assets, null, 2)}
              </code>
            </pre>
          ) : (
            <button
              type="button"
              onClick={() => getAssets()}
              disabled={connecting || loading}
              style={{
                margin: "8px",
                backgroundColor: connecting || loading ? "orange" : "grey",
              }}
            >
              Get Wallet Assets
            </button>
          )}
        </>
      )}
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
            to connect available wallets and view the assets in wallet.
          </p>

          <h3>4. Try on your own</h3>
          <p>
            Implement another component to display wallet&apos;s address and the
            amount of lovelace in your Next.js application. Check out the{' '}
            <Link href="/apis/wallet">wallet</Link> page for more details.
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
