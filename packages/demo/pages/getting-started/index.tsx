import {
  CubeTransparentIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import CardTitleDescImage from '../../components/ui/cardTitleDescImage';

const GettingStartedPage: NextPage = () => {
  const items = [
    {
      title: 'Guides',
      desc: 'Step-by-step guides to start your projects and build on Cardano',
      link: '/guides',
      thumbnailHeroicon: <DocumentTextIcon />,
    },
    {
      title: 'Starter Templates',
      desc: 'Kick start your projects with our templates using CLI',
      link: '/starter-templates',
      thumbnailHeroicon: <CubeTransparentIcon />,
    },
    {
      title: 'Migration / Manual Installation',
      desc: 'Use Mesh into your existing project, you can choose the stack and configure them.',
      link: '/migration-manual-installation',
      thumbnailHeroicon: <WrenchScrewdriverIcon />,
    },
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
            Getting Started
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            Mesh has been designed from the start for gradual adoption, and you
            can use as little or as much as you need. Whether you want to build
            an application to connect wallet and display what's in your wallet
            or start a complex dApp to create transactions and interact with
            Cardano blockchain and smart contracts - this section will help you
            get started.
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

export default GettingStartedPage;
