import {
  LockClosedIcon,
  ChevronRightIcon,
  BoltIcon,
  BeakerIcon,
} from '@heroicons/react/24/solid';

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
              Blockchain platform for everyone
            </h1>
            <p className="max-w-xl mx-auto mb-6 font-light text-gray-500 lg:mx-0 xl:mb-8 md:text-lg xl:text-xl dark:text-gray-400">
              Mina is unlocks Cardano for mass adoption. From wallet for
              personal use to interacting with web apps - users, developers and
              companies around the world use Mina to simplify their interaction
              with the Cardano blockchain.
            </p>

            <div className="grid gap-8 sm:gap-12 md:grid-cols-2 pt-8">
              <li className="flex">
                <div className="text-4xl font-extrabold lg:text-5xl text-black dark:text-white">
                  560k
                </div>
                <div className="block pl-4 text-xl text-gray-500 dark:text-gray-400">
                  <div>Active</div>
                  <div>Users</div>
                </div>
              </li>
              <li className="flex">
                <div className="text-4xl font-extrabold lg:text-5xl text-black dark:text-white">
                  42k
                </div>
                <div className="block pl-4 text-xl text-gray-500 dark:text-gray-400">
                  <div>Compatible</div>
                  <div>dApps</div>
                </div>
              </li>
            </div>
          </div>
          <div className="col-span-6">
            <img
              src="https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/search-mockup.png"
              className="dark:hidden"
              alt="mockup"
            />
            <img
              src="https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/search-mockup-dark.png"
              className="hidden dark:block"
              alt="mockup dark"
            />
          </div>
        </div>

        {/* <Button
          href="access"
          className="inline-flex items-center py-3 px-5 font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
        >
          Get started
          <ArrowLongRightIcon className="ml-2 w-5 h-5" />
        </Button> */}

        {/* <div className="grid gap-8 sm:gap-12 md:grid-cols-3">
          <div className="flex justify-center">
            <svg
              className="w-6 h-6 mr-3 text-primary-600 dark:text-primary-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
                clipRule="evenodd"
              ></path>
            </svg>
            <div>
              <h3 className="mb-1 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                Simple
              </h3>
              <p className="font-light text-gray-500 dark:text-gray-400">
                Getting started with blockchain has never been this easy. Get
                started in seconds and connect with thousands of dApps on any
                devices.
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <svg
              className="w-6 h-6 mr-3 text-primary-600 dark:text-primary-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              ></path>
            </svg>
            <div>
              <h3 className="mb-1 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                Security
              </h3>
              <p className="font-light text-gray-500 dark:text-gray-400">
                Mina wallet has at least 3 layers of security, making it the
                most secure wallet in the world.
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <svg
              className="w-6 h-6 mr-3 text-primary-600 dark:text-primary-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"
                clipRule="evenodd"
              ></path>
            </svg>
            <div>
              <h3 className="mb-1 text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                Another unique selling point
              </h3>
              <p className="font-light text-gray-500 dark:text-gray-400">
                All these requires copywriting to persuade users to join and gives confidence.
              </p>
            </div>
          </div>
        </div> */}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl text-center sm:py-16 lg:px-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          The most trusted cryptocurrency platform
        </h2>
        <p className="text-gray-500 sm:text-xl dark:text-gray-400">
          Here are a few reasons why you should choose Mina
        </p>
        <div className="mt-8 lg:mt-12 space-y-8 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-12 md:space-y-0">
          <div>
            <LockClosedIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">Secure</h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Mina wallet has at least 3 layers of security, making it the most
              secure wallet in the world.
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
            >
              Learn how we keep your funds safe
              <ChevronRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <BoltIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">Simple</h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Getting started with blockchain has never been this easy. Get
              started in seconds and connect with thousands of dApps on any
              devices.
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
            >
              Learn how Mina works
              <ChevronRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
          <div>
            <BeakerIcon className="mx-auto mb-4 w-12 h-12 text-primary-600 dark:text-primary-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">
              Best practices
            </h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">
              Built by Mesh - thoroughly tested and supports the standards.
            </p>
            <a
              href="#"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-500 dark:hover:text-primary-400"
            >
              Explore our apps
              <ChevronRightIcon className="ml-1 w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
