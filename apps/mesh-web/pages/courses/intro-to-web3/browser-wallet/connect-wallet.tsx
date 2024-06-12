import type { NextPage } from 'next';
import CourseLayout from '../../../../components/courses/layout';
import Sidebar from './../common/sidebar';
import { CardanoWallet } from '@meshsdk/react';
import Codeblock from '../../../../components/ui/codeblock';

const CoursesConnectWalletPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Connect Wallet Component`}
      desc={`Connect Wallet user interface component allows users to connect to your application with their Cardano wallets.`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesConnectWalletPage;

function Content() {
  return (
    <>
      <p>
        Suppose you're looking to bring people to your website, where they can
        mint an NFT or interact with a smart contract; they won't get very far
        unless they can connect their wallet easily. This is where Mesh connect
        wallet component comes in, to make it easier for you as a developer to
        add these buttons on your website. From the end users' perspective, it
        allows them to connect to your websites with just a few clicks. This
        section will show how to add a connect wallet button to your website.
      </p>

      <p>This is the connect wallet button component:</p>

      <CardanoWallet />

      <p>
        When you click on this button, you will notice that you can choose to
        connect to any wallets you have installed on your device. If it is the
        first time connecting to a site, your wallet will prompt and ask you for
        permission to allow the website to connect.
      </p>

      <p>
        Let's look at the code to see how we can use <code>CardanoWallet</code>.
        Open the <code>pages/index.tsx file</code>. You will notice the import
        statement at the top of the file:
      </p>

      <Codeblock
        data={'import { CardanoWallet } from "@martifylabs/mesh-react";'}
        isJson={false}
      />

      <p>
        This allows you to import the <code>CardanoWallet</code> component and
        use it your application.
      </p>

      <p>
        If you scroll down the <code>pages/index.tsx</code> file, you will
        notice:
      </p>

      <Codeblock data={'<CardanoWallet />'} isJson={false} />

      <p>
        This is the connect wallet component that is showing in your starter
        kit.
      </p>

      <p>
        It is important to note that, we need to set up the{' '}
        <code>MeshProvider</code> that provides all the context to be consumed
        by your application.
      </p>

      <p>
        Open the <code>pages/_app.tsx</code> file, you will see:
      </p>

      <Codeblock
        data={'<MeshProvider>\n  <Component {...pageProps} />\n</MeshProvider>'}
        isJson={false}
      />

      <p>
        <code>MeshProvider</code> provides the current state of the connected
        wallet. This "state" is call "context", and setting it up is as easy as
        wrapping your application with <code>MeshProvider</code>. With this
        context, you can use the connected wallet throughout your application.
        This allows you to use any React hooks provided by Mesh. We will use
        them later.
      </p>
      <p>
        With the connected wallet, you can start developing all the fun
        interactions that you want to provide on your website. For example, you
        can show your visitors your project's NFTs that they are holding in
        their wallets, or even just convert them into potential buyers for your
        product and services..
      </p>
    </>
  );
}
