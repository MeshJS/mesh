import {
  BoltIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const ReactPage: NextPage = () => {
  const items = [
    {
      title: 'Getting Started',
      desc: 'Start building web3 applications, interact with your contracts using your wallets.',
      link: '/react/getting-started',
      // thumbnail: '/react/rocket-gdc66999bf_640.png',
      thumbnailHeroicon: <RocketLaunchIcon />,
    },
    {
      title: 'UI Components',
      desc: 'UI components to speed up your app development.',
      link: '/react/ui-components',
      // thumbnail: '/react/ux-g389fb9d2b_1280.jpg',
      thumbnailHeroicon: <PaintBrushIcon />,
    },
    {
      title: 'Wallet Hooks',
      desc: 'React hooks for interacting with connected wallets.',
      link: '/react/wallet-hooks',
      // thumbnail: '/react/pocket-g7546ee58e_1280.jpg',
      thumbnailHeroicon: <BoltIcon />,
    },
  ];

  return (
    <>
      <Metatags
        title="React components and hooks for your web3 apps"
        description="Frontend components for wallet connections, and useful React hooks to getting wallet states - Mesh provides everything you need to bring your Web3 user interface to life."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            React
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Frontend components for wallet connections, and useful React
            hooks to getting wallet states - Mesh provides everything you need
            to bring your Web3 user interface to life.
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
