import {
  BanknotesIcon,
  CpuChipIcon,
  PuzzlePieceIcon,
  WalletIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const ReactPage: NextPage = () => {
  const items = [
    {
      title: 'App Wallet',
      desc: 'Wallet for building amazing applications',
      link: '/apis/appwallet',
      thumbnailHeroicon: <WalletIcon />,
    },
    {
      title: 'Browser Wallet',
      desc: 'Connect and perform wallet functions on Web3 dApps',
      link: '/apis/browserwallet',
      thumbnailHeroicon: <BanknotesIcon />,
    },
    {
      title: 'Transaction',
      desc: 'Build transactions, minting, redeem from smart contracts',
      link: '/apis/transaction',
      thumbnailHeroicon: <PuzzlePieceIcon />,
    },
    {
      title: 'Providers',
      desc: 'Speed up development with these service providers',
      link: '/apis/providers',
      thumbnailHeroicon: <CpuChipIcon />,
    },
    {
      title: 'Resolvers',
      desc: 'Functions that you need while building dApps',
      link: '/apis/resolvers',
      thumbnailHeroicon: <WrenchScrewdriverIcon />,
    },
  ];

  return (
    <>
      <Metatags
        title="Mesh APIs"
        description="From wallet integrations to transaction builders, Mesh makes Web3 development easy with reliable, scalable, and well-engineered APIs & developer tools."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Mesh API
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            From wallet integrations to transaction builders, Mesh makes Web3
            development easy with reliable, scalable, and well-engineered APIs &
            developer tools.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            return (
              <CardTitleDescImage
                title={item.title}
                desc={item.desc}
                link={item.link}
                thumbnailHeroicon={item.thumbnailHeroicon}
                key={i}
              />
            );
          })}
        </div>
      </div>
    </>
  );
};

export default ReactPage;
