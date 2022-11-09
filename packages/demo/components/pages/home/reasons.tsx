import {
  ChevronRightIcon,
  BoltIcon,
  BeakerIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';
import Link from 'next/link';

export default function Reasons() {
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
              Always up to date
            </h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Mesh is developed closely to the network updates. By using Mesh,
              your application will always be ready for the latest network
              changes, so you can focus on building your application.
            </p>
            <a
              href="https://github.com/MartifyLabs/mesh/releases"
              className="link"
              rel="noreferrer"
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
              interaction.
            </p>
            <Link href="/getting-started">
              <div className="link">
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
              Mesh adopts many CIPs, and our package is 300KB! This means that
              your application is fast, responsive and adhere to standards. Did
              we forget to mention, it well-documented!
            </p>
            <Link href="/apis/browserwallet">
              <div className="link">
                Explore our APIs
                <ChevronRightIcon className="ml-1 w-5 h-5" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
