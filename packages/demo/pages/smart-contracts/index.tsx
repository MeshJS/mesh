import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const ReactPage: NextPage = () => {
  const items = [
    {
      title: 'Markplace',
      desc: 'Build a NFT marketplace effortlessly.',
      link: '/smart-contracts/marketplace-v1',
      // thumbnail: '/react/rocket-gdc66999bf_640.png',
      thumbnailHeroicon: <ShoppingCartIcon />,
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
