import type { NextPage } from 'next';
import Link from 'next/link';
import Metatags from '../../components/site/metatags';
import Card from '../../components/ui/card';

const ReactPage: NextPage = () => {
  const guides = [
    {
      title: 'Getting Started',
      desc: 'Start building web3 applications, interact with your contracts using their wallets.',
      link: '/react/getting-started',
      thumbnail: '/react/rocket-gdc66999bf_640.png',
    },
    {
      title: 'Starter Templates',
      desc: 'Easiest way to kick start your project with one of our templates.',
      link: '/react/starter-templates',
      thumbnail: '/react/interior-design-g3564a671e_640.jpg',
    },
    {
      title: 'UI Components',
      desc: 'UI components to speed up your app development.',
      link: '/react/ui-components',
      thumbnail: '/react/ux-g389fb9d2b_1280.jpg',
    },
    {
      title: 'Wallet Hooks',
      desc: 'React hooks for interacting with connected wallet.',
      link: '/react/wallet-hooks',
      thumbnail: '/react/pocket-g7546ee58e_1280.jpg',
    },
  ];

  return (
    <>
      <Metatags
        title="React components and hooks for your web3 apps"
        description="Frontend components like connecting wallet buttons, and useful React hooks; Mesh provides everything you need to build web3 apps."
      />
      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            React
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Frontend components like connecting wallet buttons, and useful React
            hooks; Mesh provides everything you need to build web3 apps.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide, i) => {
            return (
              <Card className="cursor-pointer" key={i}>
                <Link href={guide.link}>
                  <img className="mb-5 rounded-lg" src={guide.thumbnail} />
                </Link>
                {/* <span className="bg-purple-100 text-purple-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded dark:bg-purple-200 dark:text-purple-900">
                  Article
                </span> */}
                <h2 className="my-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {guide.title}
                </h2>
                <p className="mb-4 font-light text-gray-500 dark:text-gray-400">
                  {guide.desc}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default ReactPage;
