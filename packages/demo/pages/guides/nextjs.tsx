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
        image="/guides/develop-first-web-app.png"
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
            data={`npx create-next-app@latest --typescript .`}
            isJson={false}
          />

          <h3>3. Start development server</h3>
          <p>
            After the installation is complete, start the development server
            with:
          </p>
          <Codeblock data={`npm run dev`} isJson={false} />
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
          <h3>1. Install MeshJS package</h3>
          <p>Install the latest version of Mesh with npm:</p>
          <Codeblock
            data={`npm install @meshsdk/core @meshsdk/react`}
            isJson={false}
          />

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
          <h3>
            1. Add <code>MeshProvider</code>
          </h3>
          <p>
            React context is an essential tool for building web applications. It
            allow you to easily share state in your applications, so you can use
            the data in any component within the app. This means that when the
            user has connected their wallet, visiting different pages on the app
            ensure their wallet is still connected.
          </p>
          <p>
            Open <code>pages/_app.tsx</code>, import and include{' '}
            <code>
              <Link href="/react/getting-started">MeshProvider</Link>
            </code>
            . Your <code>_app.tsx</code> should look similar to this:
          </p>
          <Codeblock
            data={`import "../styles/globals.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <MeshProvider>
      <Component {...pageProps} />
    </MeshProvider>
  );
}

export default MyApp;`}
            isJson={false}
          />

          <h3>2. Add connect wallet component and check wallet's assets</h3>
          <p>
            Lets add the{' '}
            <Link href="/react/ui-components">connect wallet component</Link> to
            allow users to connect wallets they have installed on their device.
            Connecting to wallets will ask the user for permission if not
            granted, and proceed to connect the selected wallet.
          </p>
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
import { useWallet } from '@meshsdk/react';
import { CardanoWallet } from '@meshsdk/react';

const Home: NextPage = () => {
  const { connected, wallet } = useWallet();
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
      <CardanoWallet />
      {connected && (
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

export default Home;`}
            isJson={false}
          />

          <p>Start the development server and try it:</p>
          <Codeblock data={`npm run dev`} isJson={false} />
          <p>
            Visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            to connect available wallets and view the assets in wallet.
          </p>

          <p>
            If you are new to Cardano, you will first have to download one of
            the Cardano wallets. <i>Tall Nupinks</i> has written a detailed{' '}
            <a
              href="https://cutedumborcs.substack.com/p/cardano-wallets-101"
              target="_blank"
              rel="noreferrer"
            >
              Cardano Wallets 101
            </a>{' '}
            guide to help you understand the fundamentals of a Cardano wallet,
            including its features and how it works. With this guide, you will
            be able to make an informed decision on the best Cardano wallet for
            your needs.
          </p>

          <h3>3. Try on your own</h3>
          <p>
            Implement another component to display wallet&apos;s address and the
            amount of lovelace in your Next.js application. Check out the{' '}
            <Link href="/apis/browserwallet">wallet</Link> page for more
            details.
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
