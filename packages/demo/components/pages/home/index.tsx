import {
  LockClosedIcon,
  ChevronRightIcon,
  BoltIcon,
  BeakerIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
    </>
  );
}

function Hero() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="max-w-screen-xl px-4 py-8 mx-auto lg:py-16">
        <div className="grid items-center gap-8 mb-8 lg:gap-12 lg:grid-cols-12">
          <div className="col-span-6 text-center sm:mb-6 lg:text-left lg:mb-0">
            <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl xl:text-6xl dark:text-white">
              Rapidly build Web3 apps on Cardano
            </h1>
            <p className="max-w-xl mx-auto mb-6 font-light text-gray-500 lg:mx-0 xl:mb-8 md:text-lg xl:text-xl dark:text-gray-400">
              Mesh is an open-source library to make building dApps accessible.
              Whether Web3 application or minting a NFT collection; Mesh will
              alleviate many problems from getting started, to building the most
              advance product you can imagine.
            </p>

            <Link href="/guides">
              <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
                Get started
                <ChevronRightIcon className="w-5 h-5 ml-2 -mr-1" />
              </div>
            </Link>
          </div>
          <div className="col-span-6">
            <img
              src="/logo-mesh/black/logo-mesh-black-512x512.png"
              className="dark:hidden"
              alt="mockup"
            />
            <img
              src="/logo-mesh/white/logo-mesh-white-512x512.png"
              className="hidden dark:block"
              alt="mockup dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl text-center sm:py-16 lg:px-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          The most advanced SDK on Cardano
        </h2>
        <p className="text-gray-500 sm:text-xl dark:text-gray-400">
          Here are a few reasons why you should choose Mesh
        </p>
        <div className="mt-8 lg:mt-12 space-y-8 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-12 md:space-y-0">
          <div>
            <CheckCircleIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Always up to date (Vasil ready)
            </h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Mesh is developed closely to the network updates. By using Mesh,
              your application will always be ready for the latest network
              changes.
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
            >
              Check out our change logs
              <ChevronRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <BoltIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Simple to use
            </h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Getting started with dApp development has never been this easy.
              Mesh is built in a way so you can get started in as little time as
              possible. We've built Mesh to handle difficult blockchain
              interaction so you can focus on your project.
            </p>
            <Link href="/guides">
              <div
                className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
              >
                Learn how to get started
                <ChevronRightIcon className="ml-1 w-5 h-5" />
              </div>
            </Link>
          </div>
          <div>
            <BeakerIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Best practices
            </h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Mesh adopts many CIPs, and our package is only 24KB. You dApp will
              be responsive and adhere to standards.
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
            >
              Explore our APIs
              <ChevronRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
