import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import Card from '../../ui/card';
import Codeblock from '../../ui/codeblock';

export default function FeatureCli() {
  let code1 = `npx create-mesh-app starter-next-typescript`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6 format dark:format-invert">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Get Started in Minutes
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Set up entirely new application using the Mesh CLI. Choose from one
            of our starter kit, pick a language and framework of your choice.
          </p>
          <Link href="/starter-templates">
            <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
              Get started with templates
              <ChevronRightIcon className="ml-2 -mr-1 w-5 h-5" />
            </div>
          </Link>
        </div>
        <Card>
          <h3>Starter Templates</h3>
          <p>
            Kick start your new Web3 project with one of our templates with a
            single CLI command.
          </p>
          <Codeblock data={code1} isJson={false} />
          <a
            href="http://starter-template.meshjs.dev/"
            className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 no-underline"
            target="_blank"
            rel="noreferrer"
          >
            Live Demo
          </a>
        </Card>
      </div>
    </section>
  );
}
