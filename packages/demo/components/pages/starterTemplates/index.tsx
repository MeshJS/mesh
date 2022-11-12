import Hero from './hero';
import Selector from './selector';
import Codeblock from '../../ui/codeblock';
import { useState } from 'react';
import { languages, frameworks } from './data';

const items = [
  {
    title: 'Starter Next.js TypeScript',
    template: 'starter',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app starter-next-typescript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: (
      <p>
        Start a new project on Next.js. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
      </p>
    ),
  },
  {
    title: 'Starter Next.js JavaScript',
    template: 'starter',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app starter-next-javacript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: (
      <p>
        Start a new project on Next.js. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
      </p>
    ),
  },
  {
    title: 'Starter Gatsby TypeScript',
    template: 'starter',
    framework: 'gatsby',
    language: 'typescript',
    installCode: 'npx create-mesh-app starter-gatsby-typescript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: (
      <p>
        Start a new project on Gatsby. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
      </p>
    ),
  },
  {
    title: 'Starter Gatsby JavaScript',
    template: 'starter',
    framework: 'gatsby',
    language: 'javascript',
    installCode: 'npx create-mesh-app starter-gatsby-javacript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: (
      <p>
        Start a new project on Gatsby. This starter template consist of{' '}
        <code>MeshProvider</code> and <code>CardanoWallet</code> UI component.
      </p>
    ),
  },
  {
    title: 'Minting Next.js TypeScript',
    template: 'minting',
    framework: 'next',
    language: 'typescript',
    installCode: 'npx create-mesh-app minting-next-typescript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: <p>Multi-sig minting.</p>,
  },
  {
    title: 'Minting Next.js JavaScript',
    template: 'minting',
    framework: 'next',
    language: 'javascript',
    installCode: 'npx create-mesh-app minting-next-javascript',
    demoUrl: 'http://github.com',
    repoUrl: 'http://github.com',
    desc: <p>Multi-sig minting.</p>,
  },
];

export default function ReactStarterTemplates() {
  return (
    <div className="flex justify-between lg:px-4 mx-auto w-full">
      <article className="mx-auto w-full max-w-none format format-blue dark:format-invert px-4 pt-8 pb-32">
        <Hero />
        <Main />
      </article>
    </div>
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
    <div className="not-format">
      <Selector
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        selectedFramework={selectedFramework}
        setSelectedFramework={setSelectedFramework}
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
      />

      <section className="bg-white dark:bg-gray-900">
        <div className="px-4 mx-auto max-w-screen-xl lg:px-6">
          <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
            <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
              Install Starter Templates with CLI
            </h2>
            <p className="font-light text-gray-500 lg:mb-16 sm:text-xl dark:text-gray-400">
              {numberTemplates == 0 ? (
                <>No starter templates found</>
              ) : (
                <>Kick start with one the of our starter templates</>
              )}
            </p>
          </div>
          <div className="grid gap-8 mb-6 lg:mb-16 md:grid-cols-2">
            {items.filter(filter).map((item, i) => {
              return (
                <div
                  className="p-6 bg-white rounded-lg border border-gray-200 shadow-md dark:bg-gray-800 dark:border-gray-700"
                  key={i}
                >
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
                      className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 no-underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Demo Site
                    </a>
                    <a
                      href={item.repoUrl}
                      className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-gray-900 rounded-lg border border-gray-300 hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:ring-gray-800 no-underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub Repo
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
