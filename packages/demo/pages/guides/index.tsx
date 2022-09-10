import type { NextPage } from 'next';
import Link from 'next/link';
import Metatags from '../../components/site/metatags';
import Card from '../../components/ui/card';

const GuidesPage: NextPage = () => {
  const guides = [
    {
      title: 'Start a Web3 app on Next.js',
      desc: "A step-by-step guide to setup a Next.js web application, connect wallet and browse wallet's assets.",
      link: '/guides/nextjs',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
    {
      title: 'Start a Node.js backend with NestJS',
      desc: 'Coming soon...',
      link: '/guides/nestjs',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
    {
      title: 'Lock and redeem assets with Smart Contracts',
      desc: 'Coming soon...',
      link: '/guides/coming-soon',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
    {
      title: 'How to sign in to dApp with wallet',
      desc: 'Coming soon...',
      link: '/guides/coming-soon',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
    {
      title: 'Multi-signatures assets minting',
      desc: 'Coming soon...',
      link: '/guides/coming-soon',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
    {
      title: 'Multi-signatures transactions',
      desc: 'Coming soon...',
      link: '/guides/coming-soon',
      thumbnail: '/guides/Nextjs-logo.svg',
    },
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
            Mesh has been designed from the start for gradual adoption, and you
            can use as little or as much as you need. Whether you want to build
            an application to connect wallet and display what's in your wallet
            or start a complex dApp to create transactions and interact with
            Cardano blockchain and smart contracts; this section will help you
            get started.
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

export default GuidesPage;
