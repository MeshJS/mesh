import Hero from './hero';
import Selector from './selector';
import Codeblock from '../../ui/codeblock';
import { useState } from 'react';
import { languages, frameworks } from './data';
import Card from '../../ui/card';

const items = [
  {
    title: 'Starter Next.js TypeScript',
    template: 'starter',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app leap -t starter -s next -l ts',
    demoUrl: 'http://starter-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/starter-next-ts-template',
    desc: (
      <p>
        Start a new project on Next.js. This starter template consists of a
        connect wallet button and wallet integration.
      </p>
    ),
  },
  {
    title: 'Starter Next.js JavaScript',
    template: 'starter',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app leap -t starter -s next -l js',
    demoUrl: 'http://starter-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/starter-next-js-template',
    desc: (
      <p>
        Start a new project on Next.js. This starter template consists of a
        connect wallet button and wallet integration.
      </p>
    ),
  },
  // {
  //   title: 'Starter Gatsby TypeScript',
  //   template: 'starter',
  //   framework: 'gatsby',
  //   language: 'typescript',
  //   installCode: 'npx create-mesh-app starter-gatsby-typescript',
  //   demoUrl: 'http://github.com',
  //   repoUrl: 'http://github.com',
  //   desc: (
  //     <p>
  //       Start a new project on Gatsby. This starter template consist of{' '}
  //       <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
  //     </p>
  //   ),
  // },
  // {
  //   title: 'Starter Gatsby JavaScript',
  //   template: 'starter',
  //   framework: 'gatsby',
  //   language: 'javascript',
  //   installCode: 'npx create-mesh-app starter-gatsby-javacript',
  //   demoUrl: 'http://github.com',
  //   repoUrl: 'http://github.com',
  //   desc: (
  //     <p>
  //       Start a new project on Gatsby. This starter template consist of{' '}
  //       <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
  //     </p>
  //   ),
  // },
  {
    title: 'Minting Next.js TypeScript',
    template: 'minting',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app leap -t minting -s next -l ts',
    demoUrl: 'http://minting-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/minting-next-ts-template',
    desc: (
      <p>
        Sell native tokens with multi-sig minting; where the backend server will
        build the transaction, and the user signs the transaction on the
        frontend.
      </p>
    ),
  },
  {
    title: 'Minting Next.js JavaScript',
    template: 'minting',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app leap -t minting -s next -l js',
    demoUrl: 'http://minting-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/minting-next-js-template',
    desc: (
      <p>
        Sell native tokens with multi-sig minting; where the backend server will
        build the transaction, and the user signs the transaction on the
        frontend.
      </p>
    ),
  },
  {
    title: 'Stakepool Next.js TypeScript',
    template: 'staking',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app leap -t staking -s next -l ts',
    demoUrl: 'http://staking-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/staking-next-ts-template',
    desc: (
      <p>
        Are you a stake pool operator? This starter template allows delegators
        to connect their wallet and stake with your pool.
      </p>
    ),
  },
  {
    title: 'Stakepool Next.js JavaScript',
    template: 'staking',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app leap -t staking -s next -l js',
    demoUrl: 'http://staking-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/staking-next-js-template',
    desc: (
      <p>
        Are you a stake pool operator? This starter template allows delegators
        to connect their wallet and stake with your pool.
      </p>
    ),
  },
  {
    title: 'Sign In Next.js TypeScript',
    template: 'signin',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app leap -t signin -s next -l ts',
    demoUrl: 'http://signin-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/signin-next-ts-template',
    desc: (
      <p>
        Cryptographically prove the ownership of a wallet by signing a piece of data using data sign.
      </p>
    ),
  },
  {
    title: 'Sign In Next.js JavaScript',
    template: 'signin',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app leap -t signin -s next -l js',
    demoUrl: 'http://signin-template.meshjs.dev/',
    repoUrl: 'https://github.com/MeshJS/signin-next-js-template',
    desc: (
      <p>
        Cryptographically prove the ownership of a wallet by signing a piece of data using data sign.
      </p>
    ),
  },
];

export default function ReactStarterTemplates() {
  return (
    <section className="bg-white dark:bg-gray-900 not-format">
      <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-12">
        <Hero />
        <Main />
      </div>
    </section>
  );
}

function Main() {
  const [selectedTemplate, setSelectedTemplate] =
    useState<string | undefined>(undefined);
  const [selectedFramework, setSelectedFramework] =
    useState<string | undefined>(undefined);
  const [selectedLanguage, setSelectedLanguage] =
    useState<string | undefined>(undefined);

  function filter(item) {
    if (selectedTemplate && item.template != selectedTemplate) {
      return false;
    }
    if (selectedFramework && item.framework != selectedFramework) {
      return false;
    }
    if (selectedLanguage && item.language != selectedLanguage) {
      return false;
    }
    return true;
  }

  let numberTemplates = items.filter(filter).reduce(function (count, i) {
    return count + 1;
  }, 0);

  return (
    <>
      <Selector
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        selectedFramework={selectedFramework}
        setSelectedFramework={setSelectedFramework}
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
      />

      <div className="text-center">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          Install Starter Templates
        </h2>
        <p className="font-light text-gray-500 lg:mb-16 mb-4 sm:text-xl dark:text-gray-400">
          {numberTemplates == 0 ? (
            <>No starter templates found</>
          ) : (
            <>Kick start with one the of our starter templates</>
          )}
        </p>
      </div>
      <div className="grid gap-8 mb-6 lg:mb-16 lg:grid-cols-2">
        {items.filter(filter).map((item, i) => {
          return (
            <Card key={i}>
              <div className="flex flex-col items-center space-y-4 sm:flex-row sm:justify-start sm:space-y-0 sm:space-x-4">
                <h5 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {item.title}
                </h5>

                <div className="flex flex-col space-y-4 sm:flex-row sm:justify-start sm:space-y-0 sm:space-x-4 right:0">
                  <img
                    className="object-cover w-12"
                    src={`templates/${frameworks[item.framework].image}`}
                    alt={item.title}
                  />
                  <img
                    className="object-cover w-12"
                    src={`templates/${languages[item.language].image}`}
                    alt={item.title}
                  />
                </div>
              </div>

              <div className="mb-3 font-normal text-gray-700 dark:text-gray-400 format dark:format-invert">
                {item.desc}
              </div>

              <Codeblock data={item.installCode} isJson={false} />

              <div className="flex flex-col mt-4 space-y-4 sm:flex-row sm:justify-start sm:space-y-0 sm:space-x-4">
                <a
                  href={item.demoUrl}
                  className="inline-flex items-center justify-center px-4 py-2.5 text-base font-medium text-center text-white bg-primary-700 rounded-lg hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  Live Demo
                </a>
                <a
                  href={item.repoUrl}
                  className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-gray-900 rounded-lg border border-gray-300 hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:ring-gray-800 no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Repo
                </a>

                <a
                  href={`https://demeter.run/code?repository=${item.repoUrl}.git&template=typescript`}
                  className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-white rounded-lg border border-gray-300 bg-fuchsia-600 hover:bg-fuchsia-700 focus:ring-4 focus:ring-gray-100 no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Demeter
                </a>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
