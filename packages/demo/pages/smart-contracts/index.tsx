import {
  ShoppingCartIcon,
  LockClosedIcon,
  DocumentTextIcon,
  GiftIcon,
  ArrowsRightLeftIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const ReactPage: NextPage = () => {
  const items = [
    {
      title: 'Markplace',
      desc: 'Build a NFT marketplace effortlessly',
      link: '/smart-contracts/marketplace',
      thumbnailHeroicon: <ShoppingCartIcon />,
    },
    {
      title: 'Vesting',
      desc: 'Locks up funds for a period of time',
      link: '/smart-contracts/vesting',
      thumbnailHeroicon: <LockClosedIcon />,
    },
    {
      title: 'Escrow',
      desc: 'Secure exchange of assets between two parties',
      link: '/smart-contracts/escrow',
      thumbnailHeroicon: <ArrowsRightLeftIcon />,
    },
    {
      title: 'Giftcard',
      desc: 'Create a giftcard with native tokens',
      link: '/smart-contracts/giftcard',
      thumbnailHeroicon: <GiftIcon />,
    },
    {
      title: 'Swap',
      desc: 'Trade assets between two parties',
      link: '/smart-contracts/swap',
      thumbnailHeroicon: <ArrowsRightLeftIcon />,
    },
    {
      title: 'Payment Splitter',
      desc: 'Split contract payouts equally among all payees',
      link: '/smart-contracts/payment-splitter',
      thumbnailHeroicon: <ArrowsPointingOutIcon />,
    },
  ];

  return (
    <>
      <Metatags
        title="Smart Contracts"
        description="Prebuilt smart contracts for the most common use-cases."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Smart Contracts
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Want to get started with smart contracts? Here are some contracts
            for the most common use-cases.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            return (
              <CardTitleDescImage
                title={item.title}
                desc={item.desc}
                link={item.link}
                // thumbnail={item.thumbnail}
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
