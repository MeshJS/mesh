import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const GuidesPage: NextPage = () => {
  const items = [
    {
      title: 'Start a Web3 app on Next.js',
      desc: "A step-by-step guide to setup a Next.js web application, connect wallet and browse wallet's assets.",
      link: '/guides/nextjs',
      thumbnail: '/guides/nextjs.png',
    },
    {
      title: 'Minting on Node.js',
      desc: 'Load a CLI generated key and mint assets on Node.js.',
      link: '/guides/minting-on-nodejs',
      thumbnail: '/guides/nodejs.jpg',
    },
    {
      title: 'Multi-signature Transactions',
      desc: 'Learn about multi-sig transaction, build a minting transaction involving AppWallet and BrowserWallet.',
      link: '/guides/multisig-minting',
      thumbnail: '/guides/key-gb17103099_640.jpg',
    },
    // {
    //   title: 'Start a NestJS backend',
    //   desc: 'WIP',
    //   link: '/guides/nestjs',
    //   thumbnail: '/guides/nextjs.png',
    // },
    // {
    //   title: 'Integrate your Smart Contract to a Web App',
    //   desc: 'A step-by-step guide to integrate your Cardano Smart Contract to a web application.',
    //   link: '/guides/smartcontract',
    //   thumbnail: '/guides/smart-contracts.jpg',
    // },
    // {
    //   title: 'How to sign in to dApp with wallet',
    //   desc: 'Coming soon...',
    //   link: '/guides/coming-soon',
    //   thumbnail: '/guides/nextjs.png',
    // },
    // {
    //   title: 'Multi-signatures assets minting',
    //   desc: 'Coming soon...',
    //   link: '/guides/coming-soon',
    //   thumbnail: '/guides/nextjs.png',
    // },
    // {
    //   title: 'Multi-signatures transactions',
    //   desc: 'Coming soon...',
    //   link: '/guides/coming-soon',
    //   thumbnail: '/guides/nextjs.png',
    // },
  ];

  return (
    <>
      <Metatags
        title="Guides for Getting Started"
        description="Build an application to display assets or a complex dApp to interact with Cardano blockchain and smart contracts; this section will help you get started."
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
