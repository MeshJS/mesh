import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const ProvidersPage: NextPage = () => {
  const items = [
    {
      title: 'Blockfrost',
      link: '/providers/blockfrost',
      thumbnail: '/providers/blockfrost.png',
    },
    {
      title: 'Tangocrypto',
      link: '/providers/tangocrypto',
      thumbnail: '/providers/tangocrypto.png',
    },
    {
      title: 'Koios',
      link: '/providers/koios',
      thumbnail: '/providers/koios.png',
    },
    {
      title: 'Ogmios',
      link: '/providers/ogmios',
      thumbnail: '/providers/ogmios.png',
    },
    {
      title: 'Maestro',
      link: '/providers/maestro',
      thumbnail: '/providers/maestro.png',
    },
  ];

  return (
    <>
      <Metatags
        title="Providers"
        description="Providers are services provided by the Cardano developer community, to help you ship your apps faster."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Providers
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Providers are services provided by the Cardano developer community,
            to help you ship your apps faster.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            return (
              <CardTitleDescImage
                title={item.title}
                // desc={item.desc}
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

export default ProvidersPage;
