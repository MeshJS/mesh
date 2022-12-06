import type { NextPage } from 'next';
import Link from 'next/link';
import CourseLayout from '../../../../components/courses/layout';
import Sidebar from './../common/sidebar';

const CoursesInstallWalletPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Install Cardano Wallet`}
      desc={`Download Cardano wallet to interact with the Cardano blockchain ecosystem`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesInstallWalletPage;

function Content() {
  return (
    <>
      <p>
        Cardano wallets allow users to store ADA and tokens, interact with the
        Cardano blockchain ecosystem and decentralized applications (dApps).
        Users can use the wallet to directly access a wide range of
        Cardano-based dApps to purchase NFTs, access to decentralized finance
        (DeFi) apps, and more.
      </p>
      <p>
        Many Cardano wallets are extensions compatible with popular browsers
        like Chrome. Here are a{' '}
        <a
          href="https://developers.cardano.org/showcase?tags=wallet"
          target="_blank"
          rel="noreferrer"
        >
          list of Cardano wallets
        </a>
        . But note that, not all wallets are accordance to{' '}
        <a
          href="https://cips.cardano.org/cips/cip30/"
          target="_blank"
          rel="noreferrer"
        >
          CIP-30
        </a>
        , a standard for dApps to communicate with the user's wallet.
      </p>
      <p>
        So, go ahead and pick one wallet, and install its browser extensions. In
        the spirit of decentralization, I would not suggest any wallet in this
        course.
      </p>
      <p>
        On Mesh, all wallet APIs are accessible through{' '}
        <Link href="/apis/browserwallet">Browser Wallet</Link>, and developers
        can add{' '}
        <Link href="/react/ui-components">Connect Wallet React component</Link>{' '}
        on their dApp. We will deep dive into these later.
      </p>
      <h2>Set Up Your Wallet</h2>
      <p>
        After installation, under your browser extension's submenu, you should
        see your newly-installed wallet. Clicking on it should open up the
        wallet interface, welcoming you with a few options such as create wallet
        and restore wallet.
      </p>
      <p>
        If you do not have an existing wallet, you can create a new wallet, by
        following the instructions. Generally, it should present your wallet's
        recovery phrase, a combination of 12 to 24 words that you can use to
        restore your wallet other devices. Ensure that you are not in a public
        place, and no one is watching your screen, you write and keep your
        wallet recovery phrase securely. The wallet interface will prompt you to
        enter your recovery phrase. Next, it will prompt for a password, which
        is require whenever you need to sign a transaction.
      </p>
      <p>
        If you have a wallet, select restore wallet and enter your recovery
        phrase. Ensure that no one is watching while you are doing it. After
        entering your recovery phrase, it will prompt for a password, which is
        require whenever you need to sign a transaction.
      </p>
      <h2>
        Change Network to <code>preprod</code>
      </h2>
      <p>On Cardano, there are a few networks:</p>
      <ul>
        <li>
          <b>Production network (mainnet)</b> - Production is the live network,
          also referred to as mainnet. It features official functionality
          releases.
        </li>
        <li>
          <b>Pre-production (preprod)</b> - Pre-production is the most mature
          network for testing purposes, which resembles a production (mainnet)
          environment. It is meant for testing release functionality before
          deploying on mainnet.
        </li>
        <li>
          <b>Preview (preview)</b> - Preview is the longer-term network
          environment for testing release candidates and expanded test
          scenarios. Preview is meant for testing mature release candidates.
        </li>
      </ul>
      <p>
        Before you launch your app on Cardano, it is recommended to test your
        applications on testnet. This is to test the functionality of the smart
        contracts, and ensure all transactions are working as intented. These
        tokens have no monetary value on testnet, so if there are any bugs, no
        funds are lost.
      </p>
      <p>
        Different wallets have different approach to change the network. Explore
        around the wallet's interface and change your network to{' '}
        <b>pre-production (preprod)</b>.
      </p>
      <h2>Deposit Some ADA</h2>
      <p>
        Since the Cardano testnet is an independent network, separate from the
        Cardano mainnet, it requires its own tokens. To fund your testnet
        address, go to the{' '}
        <a
          href="https://docs.cardano.org/cardano-testnet/tools/faucet"
          target="_blank"
          rel="noreferrer"
        >
          testnet faucet
        </a>{' '}
        and request some test ADA to your wallet on preprod.
      </p>
      <p>
        The faucet is a web-based service that provides test ADA (tADA) to users
        of the Cardano testnets. While these tokens have no 'real world' value,
        they enable users to experiment with Cardano testnet features, without
        having to spend ADA on the mainnet.
      </p>
    </>
  );
}
