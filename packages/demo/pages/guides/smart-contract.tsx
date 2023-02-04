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
        image="/guides/integrating-smart-contract.png"
      />
      <GuidesLayout
        title="Use your Smart Contract with Mesh"
        desc="A step-by-step guide to integrate your Cardano Smart Contract to a web application."
        sidebarItems={sidebarItems}
        image="/guides/blockchain.jpg"
      >
        <p>
          Cardano introduced smart contract support in 2021 which allowed the
          creation of a number of decentralised applications. However the
          knowledge required to develop such an app is very extensive and might
          be frightening for new developers or companies looking to build on
          Cardano. Mesh aims to solve this problem and here we are providing
          users with a comprehensive guide to facilitate their approach to
          Cardano development.
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
          </a>
          .
        </p>
        <p>
          To follow this guide you will also need a compiled Plutus Smart
          Contract, specifically its CBOR representation. If you are not
          familiar with this, check out{' '}
          <a href="https://github.com/MeshJS/mesh.plutus" target="_blank">
            Mesh.plutus
          </a>
          , a repository written by the Mesh team, containing a selection of
          pre-built Smart Contracts for various use cases.
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
            (as of writing v18.12.1).
          </p>
          <h3>3. Yarn</h3>
          <p>
            To follow this guide you will to install Yarn. Do it with the following command:
          </p>
            <Codeblock data={`npm install yarn`} isJson={false} />
          
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
            From the options menu in on Visual Studio Code, open the{' '}
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
          <Codeblock data={`npm install @meshsdk/core`} isJson={false} />

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
            get started. Your Next.js application is ready to accept wallet
            connections, browse assets and make some transactions.
          </p>
        </Element>

        <Element name="addawalletconnection">
          <h2>Add a wallet connection</h2>
          <h3>1. Install @meshsdk/react package</h3>
          <p>Install the latest version of Mesh-react with npm:</p>
          <Codeblock data={`yarn add @meshsdk/react`} isJson={false} />
          <h3>2. Setup MeshProvider</h3>
          <p>
            Open <code>pages/_app.tsx</code> and replace it with the following
            code:
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
};

export default MyApp;`}
            isJson={false}
          />
          <h3>3. Add a connect button to your website</h3>
          <p>
            Open <code>pages/index.tsx</code> and replace it with the following:{' '}
          </p>
          <Codeblock
            data={`import { CardanoWallet, useWallet } from '@meshsdk/react';
import { useState } from "react";
import type { NextPage } from "next";

const Home: NextPage = () => {
  const { wallet, connected, connecting } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <div>
      <h1>Connect Wallet</h1>
      <CardanoWallet />
    </div>
  );
};

export default Home;`}
            isJson={false}
          />
          <p>
            Done! Now visit{' '}
            <a href="http://localhost:3000" target="_blank" rel="noreferrer">
              http://localhost:3000
            </a>{' '}
            to see your connect wallet button.
          </p>
        </Element>

        <Element name="integrateSC">
          <h2>Integrate your Smart Contract</h2>
          <h3>1. Add your Plutus compiled code to the project</h3>
          <p>
            Here we will need the compiled version of your Plutus Smart
            Contract. If you don't have any or don't know what this is, check
            out the available pre-built Smart Contracts provided by the Mesh
            team{' '}
            <a href="https://github.com/MeshJS/mesh.plutus" target="_blank">
              here
            </a>
            . In this guide we will use the{' '}
            <a
              href="https://github.com/MeshJS/mesh.plutus/tree/always-true"
              target="_blank"
            >
              Always True
            </a>{' '}
            script, that, as its name suggests, always succeeds, but you can
            follow this guide with any of the pre-built Mesh smart contracts.
            Details for each contract are provided in their individual branch.
          </p>
          <p>
            Create a new folder named <code>config</code> and in it create a new
            file named <code>contract.ts</code>. Open it and insert the
            following code:
          </p>
          <Codeblock
            data={`import { PlutusScript, resolvePlutusScriptAddress } from '@meshsdk/core';

export const script: PlutusScript = {
    code: '59079559079201000033232323232323232323232323232332232323232323232222232325335333006300800530070043333573466e1cd55cea80124000466442466002006004646464646464646464646464646666ae68cdc39aab9d500c480008cccccccccccc88888888888848cccccccccccc00403403002c02802402001c01801401000c008cd4060064d5d0a80619a80c00c9aba1500b33501801a35742a014666aa038eb9406cd5d0a804999aa80e3ae501b35742a01066a0300466ae85401cccd54070091d69aba150063232323333573466e1cd55cea801240004664424660020060046464646666ae68cdc39aab9d5002480008cc8848cc00400c008cd40b9d69aba15002302f357426ae8940088c98c80c8cd5ce01981901809aab9e5001137540026ae854008c8c8c8cccd5cd19b8735573aa004900011991091980080180119a8173ad35742a004605e6ae84d5d1280111931901919ab9c033032030135573ca00226ea8004d5d09aba2500223263202e33573805e05c05826aae7940044dd50009aba1500533501875c6ae854010ccd540700808004d5d0a801999aa80e3ae200135742a00460446ae84d5d1280111931901519ab9c02b02a028135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d5d1280089aba25001135744a00226ae8940044d55cf280089baa00135742a00460246ae84d5d1280111931900e19ab9c01d01c01a101b13263201b3357389201035054350001b135573ca00226ea80054049404448c88c008dd6000990009aa80a911999aab9f0012500a233500930043574200460066ae880080548c8c8cccd5cd19b8735573aa004900011991091980080180118061aba150023005357426ae8940088c98c8054cd5ce00b00a80989aab9e5001137540024646464646666ae68cdc39aab9d5004480008cccc888848cccc00401401000c008c8c8c8cccd5cd19b8735573aa0049000119910919800801801180a9aba1500233500f014357426ae8940088c98c8068cd5ce00d80d00c09aab9e5001137540026ae854010ccd54021d728039aba150033232323333573466e1d4005200423212223002004357426aae79400c8cccd5cd19b875002480088c84888c004010dd71aba135573ca00846666ae68cdc3a801a400042444006464c6403866ae700740700680640604d55cea80089baa00135742a00466a016eb8d5d09aba2500223263201633573802e02c02826ae8940044d5d1280089aab9e500113754002266aa002eb9d6889119118011bab00132001355012223233335573e0044a010466a00e66442466002006004600c6aae754008c014d55cf280118021aba200301313574200222440042442446600200800624464646666ae68cdc3a800a40004642446004006600a6ae84d55cf280191999ab9a3370ea0049001109100091931900899ab9c01201100f00e135573aa00226ea80048c8c8cccd5cd19b875001480188c848888c010014c01cd5d09aab9e500323333573466e1d400920042321222230020053009357426aae7940108cccd5cd19b875003480088c848888c004014c01cd5d09aab9e500523333573466e1d40112000232122223003005375c6ae84d55cf280311931900899ab9c01201100f00e00d00c135573aa00226ea80048c8c8cccd5cd19b8735573aa004900011991091980080180118029aba15002375a6ae84d5d1280111931900699ab9c00e00d00b135573ca00226ea80048c8cccd5cd19b8735573aa002900011bae357426aae7940088c98c802ccd5ce00600580489baa001232323232323333573466e1d4005200c21222222200323333573466e1d4009200a21222222200423333573466e1d400d2008233221222222233001009008375c6ae854014dd69aba135744a00a46666ae68cdc3a8022400c4664424444444660040120106eb8d5d0a8039bae357426ae89401c8cccd5cd19b875005480108cc8848888888cc018024020c030d5d0a8049bae357426ae8940248cccd5cd19b875006480088c848888888c01c020c034d5d09aab9e500b23333573466e1d401d2000232122222223005008300e357426aae7940308c98c8050cd5ce00a80a00900880800780700680609aab9d5004135573ca00626aae7940084d55cf280089baa0012323232323333573466e1d400520022333222122333001005004003375a6ae854010dd69aba15003375a6ae84d5d1280191999ab9a3370ea0049000119091180100198041aba135573ca00c464c6401a66ae7003803402c0284d55cea80189aba25001135573ca00226ea80048c8c8cccd5cd19b875001480088c8488c00400cdd71aba135573ca00646666ae68cdc3a8012400046424460040066eb8d5d09aab9e500423263200a33573801601401000e26aae7540044dd500089119191999ab9a3370ea00290021091100091999ab9a3370ea00490011190911180180218031aba135573ca00846666ae68cdc3a801a400042444004464c6401666ae7003002c02402001c4d55cea80089baa0012323333573466e1d40052002212200223333573466e1d40092000212200123263200733573801000e00a00826aae74dd5000891999ab9a3370e6aae74dd5000a40004008464c6400866ae700140100092612001490103505431001123230010012233003300200200122212200201',
    version: 'V2',
};

export const scriptAddr = resolvePlutusScriptAddress(script, 1);`}
            isJson={false}
          />
          <p>
            The <code>code: </code> field is where you put the compiled CBOR
            code of your Smart Contract. If you are using a different Smart
            Contract to follow this guide, please replace the CBOR showed here
            with yours. Also, here our script is a V2 script, but feel free to
            modify this according to your needs.
          </p>
          <p>
            Note that here we use a Mesh resolver to get the address of the
            script. The resolver <code>resolvePlutusScriptAddress</code> takes
            two arguments: a PlutusScript and an integer representing the
            Network Id. Here we use the mainnet network that has an Id of{' '}
            <code>1</code>, but feel free to change it according to your
            needs (For Testnet, Preview or PreProd use <code>0</code>). For more information see{' '}
            <a href="https://meshjs.dev/apis/resolvers">Resolvers</a>.
          </p>

          <h3>2. See your Contract in action - Lock funds</h3>
          <p>
            Now that we successfully imported our contract to the project, we
            can start using it in our web application.
          </p>
          <p>
            Open <code>pages/index.tsx</code> and add the following two imports
            at the top of your file:
          </p>
          <Codeblock
            data={`import { script, scriptAddr } from "../config/contract";
import { Transaction, Data, BlockfrostProvider, resolveDataHash } from '@meshsdk/core';`}
            isJson={false}
          />
          <p>
            Now we will use the Mesh transaction builder to build the locking
            transaction. Depending on your contract you will probably need to
            modify the value and datum fields, here we will be locking one{' '}
            <a href="https://cardanoscan.io/token/asset12hd46z28ypg6gm874jklfvcsvw8d8thy5875tc">
              Testtoken
            </a>{' '}
            with a datum containing a simple integer. Indeed, because the Always
            True contract does not depend on the datum value, we can put
            whatever datum we want, and to make it simple we use an integer.
          </p>
          <p>
            Add the following function to your <code>pages/index.tsx</code>{' '}
            file, right before the <code>return</code> part.
          </p>
          <Codeblock
            data={`async function lockFunds() {
  if (wallet) {
    const addr = (await wallet.getUsedAddresses())[0];
    const d: Data = {
      alternative: 0,
      fields: [42],
    };
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
            unit: "22f20d5382cec46166b566821f16f79cb03ee1520c71e5f83a4b3f2054657374746f6b656e",
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
          <p>
            If you are wondering, we use <code>policyId+hexTokenName</code> to
            create the <code>unit</code> field of the value. To get this unit
            you can go to any Cardano explorer and search for your token, you'll
            see its policy id as well as token name both in plain text and hex.
            For example the{' '}
            <a href="https://cardanoscan.io/token/asset12hd46z28ypg6gm874jklfvcsvw8d8thy5875tc">
              Testtoken
            </a>{' '}
            on mainnet has a policy id of{' '}
            <code>
              22f20d5382cec46166b566821f16f79cb03ee1520c71e5f83a4b3f20
            </code>{' '}
            and a hex token name of <code>54657374746f6b656e</code>
            which resuslts to{' '}
            <code>
              unit:
              22f20d5382cec46166b566821f16f79cb03ee1520c71e5f83a4b3f2054657374746f6b656e
            </code>
          </p>
          <p>
            Now replace the <code>return</code> function with the following
          </p>
          <Codeblock
            data={`return (
  <div>
    <h1>Connect Wallet</h1>
    <CardanoWallet />
    {connected && (
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

          <p>
            We've now successfully locked an NFT in our script with a datum of
            value '42'. If you want to learn how to build more complex datum
            structures, check out{' '}
            <a href="https://meshjs.dev/apis/transaction/smart-contract#datum">APIs - Transaction</a>{' '}
            docs in the<code>Designing datum</code> section.
          </p>

          <h3>3. See your Contract in action - Unlock funds</h3>
          <p>
            After successfully locking some funds, now it's time to unlock them.
            Here, in addition to the datum, we will need to construct a
            redeemer. In this example we will use a simple integer, but feel
            free to modify it in accordance to what your contract requires.
          </p>
          <p>
            First let's fetch data from the blockchain at the script address to
            get the exact UTxO we are trying to spend. For this we will use
            <code>BlockfrostProvider</code>, but you can use any provider that
            Mesh supports, see{' '}
            <a href="https://meshjs.dev/apis/providers">Providers</a>.
          </p>
          <p>
            Paste the following function right before your<code>return</code>{' '}
            section
          </p>
          <Codeblock
            data={`async function _getAssetUtxo({scriptAddress, asset, datum}) {
  const blockfrostProvider = new BlockfrostProvider(
    '<blockfrostApiKey>',
  );
  const utxos = await blockfrostProvider.fetchAddressUTxOs(
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
          <p>
            The function <code>_getAssetUtxo</code> scans UTxOs at the{' '}
            <code>scriptAddress</code> and filters by datum hash to find the
            exact UTxO we are trying to spend. We need this UTxO to build the
            unlocking transaction.
          </p>
          <p>
            Now we can build our unlocking transaction, paste the following
            function right before your <code>return</code> section. Make sure to
            construct the same datum you used when locking the funds.
          </p>
          <Codeblock
            data={`async function unlockFunds() {
  if (wallet) {
    setLoading(true);
    const addr = (await wallet.getUsedAddresses())[0];
    const datumConstr: Data = {
      alternative: 0,
      fields: [42],
    };
    const redeemer = {
      data: {
        alternative: 0,
        fields: [21],
      },
    };
    
    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddr, 
      asset: '22f20d5382cec46166b566821f16f79cb03ee1520c71e5f83a4b3f2054657374746f6b656e',
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
          <p>
            Let's take a look at what this function does. We first set our
            constants <code>addr, datumConstr, redeemer</code>, as explained
            previously in this guide we use the <code>Always True</code> script
            that works with any Datum and Redeemer, so here we construct the
            same Datum as when locking (has to be the same!) and a random
            Redeemer. Then we use the previously defined{' '}
            <code>_getAssetUtxo</code> function to fetch the UTxO we are trying
            to spend. Finally we build the unlock transaction in <code>tx</code>{' '}
            where we pass all the necessary fields to unlock funds from a
            script.
          </p>
          <p>
            Finally, let's change the <code>return</code> function once more, to
            make it unlock funds this time. Replace it with the following code:
          </p>
          <Codeblock
            data={`return (
  <div>
    <h1>Connect Wallet</h1>
    <CardanoWallet />
    {connected && (
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
          <p>
            Congratulations, you've succesfully integrated your Smart Contract
            to a web application!
          </p>
          <p>
            Now you may want to explore more complex datum/redeemer structures,
            V2 features, Plutus minting and more. Mesh supports each of these
            features and we are continuously working on adding more guides and
            expanding the docs. If you have any issues please report them in our{' '}
            <a href="https://discord.gg/Z6AH9dahdH">Discord</a> server or open
            an issue on{' '}
            <a href="https://github.com/MeshJS/mesh">Mesh's Github page</a>.{' '}
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
