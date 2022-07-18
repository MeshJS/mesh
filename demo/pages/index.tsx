import { useState } from "react";

const Home = () => {
  const [showInstall, setShowInstall] = useState(false);
  return (
    <>
      <Hero setShowInstall={setShowInstall} />
      {showInstall && <Install setShowInstall={setShowInstall} />}
    </>
  );
};

function Hero({ setShowInstall }) {
  return (
    <section className="bg-white dark:bg-gray-900 mt-16">
      <div className="grid max-w-screen-xl px-4 py-8 mx-auto lg:gap-8 xl:gap-0 lg:py-16 lg:grid-cols-12">
        <div className="mr-auto place-self-center lg:col-span-7">
          <h1 className="max-w-2xl mb-4 text-4xl font-extrabold leading-none md:text-5xl xl:text-6xl dark:text-white">
            Rapidly build Web3 apps on the Cardano blockchain
          </h1>
          <p className="max-w-2xl mb-6 font-light text-gray-500 lg:mb-8 md:text-lg lg:text-xl dark:text-gray-400">
            Access to advanced blockchain capbilities via Martify APIs, build
            and submit transactions, accessing information stored on the
            blockchain, add files on IPFS.
          </p>
          <a
            href="#"
            className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-900"
            onClick={() => setShowInstall(true)}
          >
            Get started
          </a>
          {/* <a
              href="#"
              className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-center text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:ring-gray-800"
            >
              Demo
            </a> */}
        </div>
        <div className="hidden lg:mt-0 lg:col-span-5 lg:flex">
          {/* <img
              src="https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/phone-mockup.png"
              alt="mockup"
            /> */}
        </div>
      </div>
    </section>
  );
}

function Install({ setShowInstall }) {
  return (
    <div
      id="menu"
      className="w-full h-full bg-gray-900 bg-opacity-80 top-0 fixed sticky-0"
    >
      <div className="2xl:container  2xl:mx-auto py-48 px-4 md:px-28 flex justify-center items-center">
        <div className="w-96 md:w-auto dark:bg-gray-800 relative flex flex-col justify-center items-center bg-white py-16 px-4 md:px-24 xl:py-24 xl:px-36">
          <div className="mt-12">
            <h1
              role="main"
              className="text-3xl dark:text-white lg:text-4xl font-semibold leading-7 lg:leading-9 text-center text-gray-800"
            >
              Get started on Mesh
            </h1>
          </div>
          <div className="mt">
            <div className="mt-6 sm:w-80 text-base dark:text-white leading-7 text-center text-gray-800">
              <pre>yarn install @martifylabs/mesh</pre>
            </div>
          </div>
          <a
            className="w-full dark:text-gray-800 dark:hover:bg-gray-100 dark:bg-white sm:w-auto mt-14 text-base leading-4 text-center text-white py-6 px-16 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 bg-gray-800 hover:bg-black"
            href="https://github.com/MartifyLabs/mesh"
            target="_blank"
          >
            Visit the Mesh repo for details
          </a>
          {/* <a href="javascript:void(0)" className="mt-6 dark:text-white dark:hover:border-white text-base leading-none focus:outline-none hover:border-gray-800 focus:border-gray-800 border-b border-transparent text-center text-gray-800">link</a> */}
          <button
            className="text-gray-800 dark:text-gray-400 absolute top-8 right-8 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800"
            aria-label="close"
            onClick={() => setShowInstall(false)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 6L18 18"
                stroke="currentColor"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
export default Home;
