import { Codeblock, Metatags } from '../../components';
import Link from 'next/link';
import Help from './help';

const Nextjs = () => {
  return (
    <>
      <Metatags
        title="Start a Web3 app on Next.js"
        description="A step-by-step guide to setup a Next.js web application, connect wallet and browse wallet's assets."
      />

      <section className="py-8 px-4 lg:py-16 lg:px-6">
        <h1>Start a Web3 app on Next.js</h1>
        <p className="lead">
          A step-by-step guide to setup a Next.js web application, connect
          wallet and browse wallet&apos;s assets.
        </p>

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
          programming language. If you don&apos;t feel very confident, we
          recommend going through this{' '}
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
          or watch a few{' '}
          <a
            href="https://www.youtube.com/results?search_query=get+started+with+nextjs"
            target="_blank"
            rel="noreferrer"
          >
            videos from YouTube
          </a>
          .
        </p>

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
          manager, which comes bundled with Node.js when you install it on your
          system. Run this command on your system Terminal:
        </p>
        <Codeblock data={`npm install --global yarn`} isJson={false} />

        <h2>Setup Next.js</h2>
        <h3>1. Create project folder and open Visual Studio Code</h3>
        <p>
          Create a new folder for your project. Give the folder a meaningful
          name.
        </p>
        <p>
          Open the Visual Studio Code application and drag your project folder
          in.
        </p>

        <h3>2. Create Next.js app</h3>
        <p>
          Open the Terminal on your Visual Studio Code and execute this command:
        </p>
        <Codeblock
          data={`yarn create next-app --typescript .`}
          isJson={false}
        />

        <h3>3. Start development server</h3>
        <p>
          After the installation is complete, start the development server on
          http://localhost:3000:
        </p>
        <Codeblock data={`yarn run dev`} isJson={false} />
        <p>
          Visit{' '}
          <a href="http://localhost:3000" target="_blank" rel="noreferrer">
            http://localhost:3000
          </a>{' '}
          to view your application. <b>CTRL+C</b> to stop the application.
        </p>

        <h2>Setup Mesh</h2>
        <h3>1. Install the @martifylabs/mesh package</h3>
        <p>Install the latest version of Mesh with yarn:</p>
        <Codeblock data={`yarn add @martifylabs/mesh`} isJson={false} />

        <h3>
          2. Add webpack in <b>next.config.js</b>
        </h3>
        <p>
          Open <b>next.config.js</b> and append the following:
        </p>
        <Codeblock
          data={`const nextConfig = {
  ...
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.resolve.fallback = { fs: false };
    return config;
  },
};`}
          isJson={false}
        />
        <p>
          Your <b>next.config.js</b> should look like this:
        </p>
        <Codeblock
          data={`/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.resolve.fallback = { fs: false };
    return config;
  },
};
module.exports = nextConfig;`}
          isJson={false}
        />
        <h3>3. Congratulations</h3>
        <p>
          You just saved a few weeks of learning and a number days trying to get
          started. Your Next.js application is ready to connect wallet, browse
          assets and make some transactions. Start the development server:
        </p>
        <Codeblock data={`yarn run dev`} isJson={false} />

        <h2>See it in action</h2>
        <h3>1. Create a Connect Wallet component</h3>
        <p>
          Create a new folder named <b>components</b> and create a new file
          named <b>connectWallet.tsx</b>. Open{' '}
          <b>components/connectWallet.tsx</b> and insert the following codes:
        </p>
        <Codeblock
          data={`import { useEffect, useState } from "react";
import Mesh from "@martifylabs/mesh";

const WALLETS: { [name: string]: { name: string } } = {
  nami: {
    name: "Nami",
  },
  ccvault: {
    name: "Eternl",
  },
  gerowallet: {
    name: "Gero",
  },
};

export default function ConnectWallet({
  setWalletConnected,
}: {
  setWalletConnected?: any;
}) {
  const [availableWallets, setAvailableWallets] = useState<string[] | null>(
    null
  );
  const [connecting, setConnecting] = useState<boolean>(false);
  const [walletNameConnected, setWalletNameConnected] = useState<string>("");

  async function connectWallet(walletName: string) {
    setConnecting(true);
    const walletConnected = await Mesh.wallet.enable({
      walletName: walletName,
    });
    if (walletConnected) {
      if (setWalletConnected) {
        setWalletConnected(true);
      }
      setWalletNameConnected(walletName);
    }
    setConnecting(false);
  }

  useEffect(() => {
    async function init() {
      setAvailableWallets(await Mesh.wallet.getAvailableWallets());
    }
    init();
  }, []);

  return (
    <>
      {availableWallets
        ? availableWallets.length == 0
          ? "No wallets found"
          : availableWallets.map((walletName, i) => (
              <button
                key={i}
                onClick={() => connectWallet(walletName)}
                disabled={connecting || walletNameConnected == walletName}
                style={{
                  fontWeight:
                    walletNameConnected == walletName ? "bold" : "normal",
                  margin: "8px",
                  backgroundColor:
                    walletNameConnected == walletName
                      ? "green"
                      : connecting
                      ? "orange"
                      : "grey",
                }}
              >
                Connect with {WALLETS[walletName].name}
              </button>
            ))
        : ""}
    </>
  );
}`}
          isJson={false}
        />

        <h3>2. Lets connect wallet and check wallet&apos;s assets</h3>
        <p>
          Open <b>pages/index.tsx</b> and replace it with the following codes:
        </p>
        <Codeblock
          data={`import { useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";
import ConnectWallet from "../components/connectWallet";

const Home: NextPage = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [assets, setAssets] = useState<null | any>(null);

  async function getAssets() {
    setLoading(true);
    const _assets = await Mesh.wallet.getAssets();
    setAssets(_assets);
    setLoading(false);
  }

  return (
    <div>
      <h1>Connect Wallet</h1>
      <ConnectWallet setWalletConnected={setWalletConnected} />
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
              disabled={loading}
              style={{
                margin: "8px",
                backgroundColor: loading ? "orange" : "grey",
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

export default Home;
`}
          isJson={false}
        />

        <h3>3. Start server and try it</h3>
        <p>Start the development server:</p>
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
          Try displaying your wallet&apos;s address and the amount of lovelace
          in your Next.js application. Check out the{' '}
          <Link href="/wallet">wallet</Link> page for more details.
        </p>

        <Help />
      </section>
    </>
  );
};

export default Nextjs;
