import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';
import Image from '../../components/ui/image';

const GuideCustomMarketplacePage: NextPage = () => {
  const sidebarItems = [
    { label: 'Install Starter Kit', to: 'installstarter' },
    { label: 'Setup MongoDB', to: 'mongodb' },
    { label: 'Customize Marketplace', to: 'marketplace' },
  ];

  return (
    <>
      <Metatags
        title="Build your NFT marketplace"
        description="Whether you are building a marketplace for your business or for your clients, we have you covered. Get started in minutes."
        image="/guides/custom-marketplace.png"
      />
      <GuidesLayout
        title="Build your NFT marketplace"
        desc="Whether you are building a marketplace for your business or for your clients, we have you covered. Get started in minutes."
        sidebarItems={sidebarItems}
        image="/guides/supermarket-g42acef7c1_640.jpg"
      >
        <IntroSection />
        <InstallStarter />
        <Mongodb />
        <Marketplace />
      </GuidesLayout>
    </>
  );
};

function IntroSection() {
  return (
    <>
      <p>
        A NFT (Non-Fungible Token) marketplace is a digital platform that allows
        users to buy and sell NFTs. NFTs are unique digital assets that are
        stored on a blockchain, providing proof of ownership and authenticity.
        NFT marketplaces provide a platform for artists, collectors, and
        investors to showcase and trade their digital assets, including digital
        art, music, videos, and other digital goods.
      </p>
      <p>
        In this guide, we will show you how to build your own NFT marketplace on
        a Cardano blockchain. With Mesh, we provide you with a ready-made
        marketplace starter kit that you can customize to your needs.
      </p>
      <a
        href="https://marketplace-template.meshjs.dev/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center border border-indigo-500 bg-indigo-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-indigo-600 focus:outline-none focus:shadow-outline"
      >
        Live demo
      </a>
    </>
  );
}

function InstallStarter() {
  return (
    <Element name="installstarter">
      <h2>Install starter kit</h2>
      <p>
        To begin, you can use Mesh CLI to get the marketplace starter kit by
        running the following command:
      </p>
      <Codeblock
        data={`npx create-mesh-app my-marketplace -t marketplace -s next -l ts`}
        isJson={false}
      />
      <p>
        Or clone from our{' '}
        <a
          href="https://github.com/MeshJS/marketplace-next-ts-template"
          target="_blank"
          rel="noreferrer"
        >
          GitHub repository
        </a>
        .
      </p>
      <p>
        Next you need to install the dependencies by running the following
        command in the project directory:
      </p>
      <Codeblock data={`yarn install`} isJson={false} />
    </Element>
  );
}

function Mongodb() {
  return (
    <Element name="mongodb">
      <h2>Setup MongoDB</h2>
      <h3>What is MongoDB?</h3>
      <p>
        MongoDB is a popular, open-source, document-oriented database management
        system. It is designed to store and manage large volumes of unstructured
        or semi-structured data, such as JSON documents, and provides high
        performance and scalability.
      </p>
      <p>
        Unlike traditional relational databases, MongoDB stores data in
        flexible, JSON-like documents with dynamic schemas, which makes it
        easier to represent complex hierarchical relationships and evolving data
        structures.
      </p>
      <h3>Create MongoDB Atlas Account</h3>
      <p>
        The easiest way to get started with MongoDB is by using the Atlas
        developer data platform. A free tier is available with basic database
        functionalities. This free tier is more than enough for the purposes of
        this tutorial.{' '}
        <a
          href="https://account.mongodb.com/account/register"
          target="_blank"
          rel="noreferrer"
        >
          Register a free Atlas account
        </a>{' '}
        with your email address (no credit card required).
      </p>
      <h3>Deploy your first cluster</h3>
      <p>
        Once you have created your account, you will be redirected to the Atlas
        UI where you can create your first cluster. Give your cluster a name and
        select the region where you want to deploy it. For this article, we will
        use the free tier cluster.
      </p>
      <p>
        Atlas free clusters provide a small-scale development environment to
        host your data. Free clusters never expire, and provide access to a{' '}
        <a
          href="https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/#std-label-atlas-free-tier"
          target="_blank"
          rel="noreferrer"
        >
          subset of Atlas features and functionality
        </a>
        . Paid clusters provide full access to Atlas features, configuration
        options, and operational capabilities. For production throughput and
        richer metrics, you can upgrade to a dedicated cluster at any time. For
        more information on deployment instructions, see official documentation
        on{' '}
        <a
          href="https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/"
          target="_blank"
          rel="noreferrer"
        >
          deploy free tier cluster
        </a>{' '}
        and{' '}
        <a
          href="https://www.mongodb.com/docs/atlas/tutorial/create-new-cluster/"
          target="_blank"
          rel="noreferrer"
        >
          create new cluster
        </a>
        .
      </p>

      <Image src="/guides/custom-marketplace-1.jpeg" />

      <h3>Add Your Connection IP Address to Your IP Access List</h3>
      <p>
        You must add your IP address to the IP access list before you can
        connect to your cluster. You can add <code>0.0.0.0/0</code> to access
        from any IP address (not recommended for production).
      </p>
      <p>
        An IP is a unique numeric identifier for a device connecting to a
        network. In Atlas, you can only connect to a cluster from a trusted IP
        address. Within Atlas, you can create a list of trusted IP addresses,
        referred to as a IP access list, that can be used to connect to your
        cluster and access your data. For more information on adding your
        connection IP address instructions, see{' '}
        <a
          href="https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/"
          target="_blank"
          rel="noreferrer"
        >
          official documentation
        </a>
        .
      </p>
      <h3>
        Configure your <code>.env.local</code> file
      </h3>
      <p>
        Once you have created a cluster, you can connect to it using a
        connection string. A connection string is a string of characters that
        contains the information required to connect to a MongoDB deployment.
        For more information on connecting to your app, see{' '}
        <a
          href="https://www.mongodb.com/docs/atlas/driver-connection/"
          target="_blank"
          rel="noreferrer"
        >
          driver-connection
        </a>
        .
      </p>
      <ol>
        <li>Click Database in the top-left corner of Atlas.</li>
        <li>
          In the Database Deployments view, click <code>Connect</code> for the
          database deployment to which you want to connect.
        </li>
        <li>
          Select <code>Connect your application</code>
        </li>
        <li>
          Copy your <code>connection string</code>, it should look like this:{' '}
          <Codeblock
            data={`mongodb+srv://jingles:<password>@mesh.meshsdk.mongodb.net/?retryWrites=true&w=majority`}
            isJson={false}
          />
          <Image src="/guides/custom-marketplace-2.png" />
        </li>
        <li>
          Go to your project folder, and rename <code>.env.local.example</code>{' '}
          to <code>.env.local</code>
        </li>
        <li>
          Paste your <code>connection string</code> in the{' '}
          <code>MONGODB_URI</code> field in your <code>.env.local</code> file
        </li>
        <li>
          Replace <code>{`<password>`}</code> with the password you have created
          for your database
        </li>
        <li>
          Copy the name you have created for your database in the{' '}
          <code>MONGODB_DBNAME</code> field in your <code>.env.local</code> file
        </li>
      </ol>
      <p>
        Once the dependencies are installed and the environment variables are in
        place, you can start the development server by running the following
        command:
      </p>
      <Codeblock data={`yarn dev`} isJson={false} />
    </Element>
  );
}

function Marketplace() {
  let codeConfig = ``;
  codeConfig += `const marketplace = new BasicMarketplace({\n`;
  codeConfig += `  fetcher: blockchainProvider,\n`;
  codeConfig += `  initiator: wallet,\n`;
  codeConfig += `  network: "preprod",\n`;
  codeConfig += `  signer: wallet,\n`;
  codeConfig += `  submitter: blockchainProvider,\n`;
  codeConfig += `  percentage: 25000, // 2.5%\n`;
  codeConfig += `  owner: "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",\n`;
  codeConfig += `});\n`;

  return (
    <Element name="marketplace">
      <h2>Customize Marketplace</h2>
      <p>
        Open the file <code>lib/marketplace.ts</code>, you will see the
        following code:
      </p>
      <Codeblock data={codeConfig} isJson={false} />
      <p>Lets go through what each of these options mean:</p>
      <ul>
        <li>
          <b>fetcher: </b>Using one of our{' '}
          <Link href="/providers">blockchain providers</Link>, we use the
          fetcher to query for the locked UTxO.
        </li>
        <li>
          <b>initiator: </b>For starters, this is the connected{' '}
          <Link href="/apis/browserwallet">user's wallet</Link>.
        </li>
        <li>
          <b>network: </b>It has to be one of the following values:{' '}
          <code>"testnet" | "preview" | "preprod" | "mainnet"</code>.
        </li>
        <li>
          <b>signer: </b>For starters, this is the connected{' '}
          <Link href="/apis/browserwallet">user's wallet</Link>.
        </li>
        <li>
          <b>submitter: </b>use one of our{' '}
          <Link href="/providers">blockchain providers</Link>, we use the
          submitter to submit the transaction.
        </li>
        <li>
          <b>percentage: </b>The percentage of the sale price that the
          marketplace <code>owner</code> will take. Note that, the fee numerator
          is in the order of millions, for example <code>3000</code> implies a
          fee of <code>3000/1_000_000</code> (or <code>0.003</code>) implies a
          fee of <code>0.3%</code>.
        </li>
        <li>
          <b>owner: </b>The wallet address of the marketplace owner which will
          receive the marketplace fee.
        </li>
      </ul>
      <p>
        There are 4 actions (or endpoints) available to interact with this smart
        contract:
      </p>
      <ul>
        <li>list asset</li>
        <li>buy asset</li>
        <li>updating listing</li>
        <li>cancel listing</li>
      </ul>
      <p>
        Do visit the{' '}
        <Link href="/smart-contracts/marketplace">
          marketplace endpoints documentation and live demo
        </Link>{' '}
        to learn more about these actions.
      </p>
    </Element>
  );
}

export default GuideCustomMarketplacePage;
