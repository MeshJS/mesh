import { useState } from 'react';
import { Modal } from '../components';
import { XIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/solid';

const Home = () => {
  const [showInstall, setShowInstall] = useState(false);
  return (
    <>
      <Hero setShowInstall={setShowInstall} />
      {showInstall && <Install showModal={setShowInstall} />}
    </>
  );
};

function Hero({ setShowInstall }) {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="grid max-w-screen-xl px-4 py-8 mx-auto lg:gap-8 xl:gap-0 lg:py-16 lg:grid-cols-12">
        <div className="mr-auto place-self-center lg:col-span-7">
          <h1 className="mb-4 text-4xl font-extrabold leading-none md:text-5xl xl:text-6xl dark:text-white">
            Rapidly build Web3 apps on Cardano blockchain
          </h1>
          <p className="mb-6 font-light text-gray-500 lg:mb-8 md:text-lg lg:text-xl dark:text-gray-400">
            Access to advanced blockchain capabilities via Martify APIs, build
            and submit transactions, accessing information stored on the
            blockchain, add files on IPFS.
          </p>
          <button
            className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-900"
            onClick={() => setShowInstall(true)}
          >
            Get started <ChevronRightIcon className="ml-1 w-6 h-6" />
          </button>
          {/* <a
              href="#"
              className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-center text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:ring-gray-800"
            >
              Demo
            </a> */}
        </div>
        <div className="hidden lg:mt-0 lg:col-span-5 lg:flex">
          {/* <img
              src="https://"
              alt="mockup"
            /> */}
        </div>
      </div>
    </section>
  );
}

function Install({ showModal }) {
  return (
    <Modal>
      <div className="text-center mb-8">
        <h2>Get started on Mesh</h2>
        <pre>yarn add @martifylabs/mesh</pre>
        <Link href="/guides">Learn more</Link>
        {/* <a
          href="https://github.com/MartifyLabs/mesh"
          className="mt-6 dark:text-white dark:hover:border-white text-base leading-none focus:outline-none hover:border-gray-800 focus:border-gray-800 border-b border-transparent text-center text-gray-800"
          target="_blank"
          rel="noreferrer"
        >
          Visit the Github repo for details
        </a> */}
      </div>

      <button
        className="text-gray-800 dark:text-gray-400 absolute top-8 right-8 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800"
        aria-label="close"
        onClick={() => showModal(false)}
      >
        <XIcon className="w-6 h-6" />
      </button>
    </Modal>
  );
}

export default Home;
