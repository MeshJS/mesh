import type { NextPage } from 'next';
import Link from 'next/link';
import Metatags from '../../components/site/metatags';
import Card from '../../components/ui/card';

const GettingStartedPage: NextPage = () => {
  const guides = [
    {
      title: 'Guides',
      desc: 'Step-by-step guides to start your projects and building on Cardano',
      link: '/guides',
      thumbnail: '/getting-started/office-g8b03895cc_640.jpg',
    },
    {
      title: 'Starter Templates',
      desc: 'Kick start your projects with our templates using CLI',
      link: '/starter-templates',
      thumbnail: '/getting-started/color-samples-g2e3c7e40c_1280.jpg',
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
            Getting Started
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

export default GettingStartedPage;
