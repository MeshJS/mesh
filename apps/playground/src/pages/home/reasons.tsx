import Link from "next/link";
import {
  BeakerIcon,
  BoltIcon,
  CheckCircleIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/solid";

export default function Reasons() {
  return (
    <section>
      <div className="mx-auto max-w-screen-xl px-4 py-8 text-center sm:py-16 lg:px-6">
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          The complete SDK for web3 development on Cardano
        </h2>
        <p className="text-neutral-500 sm:text-xl dark:text-neutral-400">
          Here are a few reasons why you should use Mesh
        </p>
        <div className="mt-8 space-y-8 md:grid md:grid-cols-2 md:gap-12 md:space-y-0 lg:mt-12 lg:grid-cols-3">
          <div>
            <CheckCircleIcon className="text-primary-600 dark:text-primary-500 mx-auto mb-4 h-12 w-12" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Always up to date
            </h3>
            <p className="mb-4 text-neutral-500 dark:text-neutral-400">
              Mesh is developed closely to network updates. By using Mesh, your
              application will always be ready for the latest network changes,
              so you can focus on building your application.
            </p>
            <Link href="/about">
              <div className="link">
                Learn more about Mesh
                <ChevronRightIcon className="ml-1 h-5 w-5" />
              </div>
            </Link>
          </div>
          <div>
            <BoltIcon className="text-primary-600 dark:text-primary-500 mx-auto mb-4 h-12 w-12" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Simple to use
            </h3>
            <p className="mb-4 text-neutral-500 dark:text-neutral-400">
              Getting started with Web3 app development has never been this easy.
              Mesh is conceived in a way that facilitates and speeds up
              development of decentralised applications.
            </p>
            <Link href="/resources">
              <div className="link">
                Resources to get you started
                <ChevronRightIcon className="ml-1 h-5 w-5" />
              </div>
            </Link>
          </div>
          <div>
            <BeakerIcon className="text-primary-600 dark:text-primary-500 mx-auto mb-4 h-12 w-12" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Best practices
            </h3>
            <p className="mb-4 text-neutral-500 dark:text-neutral-400">
              Mesh follows many CIPs that make it interoprable with other
              Cardano tools. In addition, the package is less than 300kB! This
              means your application is fast, responsive and adheres to
              standards.
            </p>
            <Link href="/apis">
              <div className="link">
                Explore our APIs
                <ChevronRightIcon className="ml-1 h-5 w-5" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
