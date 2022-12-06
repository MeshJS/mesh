import { ArrowRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

export default function AboutHero() {
  return (
    <section className="bg-[url('/about/road-g5604c4b4e_1280.jpg')] bg-no-repeat bg-cover bg-center bg-gray-700 bg-blend-multiply ">
      <div className="relative py-8 px-4 mx-auto max-w-screen-xl text-white lg:py-16 z-1">
        <div className="mb-6 max-w-screen-lg lg:mb-0">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight leading-none md:text-5xl lg:text-6xl">
            We advance Cardano's tech stack
          </h1>
          <p className="mb-6 font-light text-gray-400 lg:mb-8 md:text-lg lg:text-xl">
            Get started building blockchain applications with our
            enterprise-ready, well engineered, and professionally designed SDK,
            Mesh. With over 20+ components crafted ready for Vasil and many more
            in the pipeline, building a Web 3.0 application has never been this
            easy.
          </p>
          {/* <a
            href="https://discord.gg/Z6AH9dahdH"
            rel="noreferrer"
            className="inline-flex items-center py-3 px-5 font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-900 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
          >
            Learn more about the plan
            <ArrowRightIcon className="ml-2 -mr-1 w-5 h-5" />
          </a> */}
        </div>
        <div className="grid gap-8 pt-8 lg:pt-12 mt-8 lg:mt-12 border-t border-gray-600 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="mb-1 text-lg font-bold">Version 1.3</h2>
            <p className="mb-1 text-sm text-gray-400">We are now MeshJS</p>
            <a
              href="https://www.npmjs.com/package/@meshsdk/core"
              rel="noreferrer"
              className="link"
              target="_blank"
            >
              NPM page
              <ArrowRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <h2 className="mb-1 text-lg font-bold">Starter templates</h2>
            <p className="mb-1 text-sm text-gray-400">
              Start your project by installing with CLI
            </p>
            <Link href="/starter-templates">
              <span className="link">
                Learn more
                <ArrowRightIcon className="ml-1 w-5 h-5" />
              </span>
            </Link>
          </div>
          <div>
            <h2 className="mb-1 text-lg font-bold">
              React components and hooks
            </h2>
            <p className="mb-1 text-sm text-gray-400">
              Everything you need to build web3 apps
            </p>
            <Link href="/react">
              <span className="link">
                Learn more
                <ArrowRightIcon className="ml-1 w-5 h-5" />
              </span>
            </Link>
          </div>
          <div>
            <h2 className="mb-1 text-lg font-bold">Version 1.0</h2>
            <p className="mb-1 text-sm text-gray-400">
              We released Mesh 1.0 on Sept 22, 2022
            </p>
            <a
              href="https://www.npmjs.com/package/@meshsdk/core"
              rel="noreferrer"
              className="link"
              target="_blank"
            >
              NPM page
              <ArrowRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          {/* <div>
            <h2 className="mb-1 text-lg font-bold">Minting is ready</h2>
            <p className="mb-1 text-sm text-gray-400">
              Flowbite aims to achieve net-zero emissions
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-semibold text-primary-500 hover:underline"
            >
              Read more
              <ArrowRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <h2 className="mb-1 text-lg font-bold">Embedded wallet</h2>
            <p className="mb-1 text-sm text-gray-400">
              Embedded wallet can generate keys and import CLI wallets
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-semibold text-primary-500 hover:underline"
            >
              Read more
              <ArrowRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <h2 className="mb-1 text-lg font-bold">2022 plans</h2>
            <p className="mb-1 text-sm text-gray-400">
              Investing in the future of Africa
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-semibold text-primary-500 hover:underline"
            >
              Read more
              <ArrowRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div> */}
        </div>
      </div>
    </section>
  );
}
