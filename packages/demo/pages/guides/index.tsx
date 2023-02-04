import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const GuidesPage: NextPage = () => {
  const items = [
    {
      title: 'Develop your first Web3 App',
      desc: 'A step-by-step guide to setup a Next.js web application, add a wallet connection and browse assets.',
      link: '/guides/nextjs',
      thumbnail: '/guides/develop-first-web-app.png',
    },
    {
      title: 'Minting Application',
      desc: 'Load CLI generated keys and mint assets on Node.js.',
      link: '/guides/minting-on-nodejs',
      thumbnail: '/guides/minting-application.png',
    },
    {
      title: 'Multi-Signatures Transaction',
      desc: 'Learn about multi-sig transaction, build a minting transaction involving AppWallet and BrowserWallet.',
      link: '/guides/multisig-minting',
      thumbnail: '/guides/multi-signatures-transaction.png',
    },
    {
      title: 'Integrating Smart Contract',
      desc: 'A step-by-step guide to integrate your Cardano Smart Contract to a web application.',
      link: '/guides/smart-contract',
      thumbnail: '/guides/integrating-smart-contract.png',
    },
    {
      title: 'Prove Wallet Ownership',
      desc: 'Cryptographically prove the ownership of a wallet by signing a piece of data using data sign.',
      link: '/guides/prove-wallet-ownership',
      thumbnail: '/guides/cryptographically-prove-wallet-ownership.png',
    },
    {
      title: 'Implement Custom Provider',
      desc: 'Build custom Providers that provides API to access and process information provided by services.',
      link: '/guides/custom-provider',
      thumbnail: '/guides/implement-custom-provider.png',
    },

    // {
    //   title: 'Minting Reference Token',
    //   desc: 'Something to describe this guide',
    //   link: '/guides/minting-reference-token',
    //   thumbnail: '/guides/?.png',
    // },
  ];

  return (
    <>
      <Metatags
        title="Guides for Getting Started"
        description="Build an application to display assets or a complex dApp to interact with Cardano blockchain and smart contracts - this section will help you get started."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Our Guides
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Whether you are new to web development or a seasoned blockchain
            full-stack developer, these guides will help you get started.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            return (
              <CardTitleDescImage
                title={item.title}
                desc={item.desc}
                link={item.link}
                thumbnail={item.thumbnail}
                key={i}
              />
            );
          })}
        </div>
      </div>
    </>
  );
};

export default GuidesPage;
