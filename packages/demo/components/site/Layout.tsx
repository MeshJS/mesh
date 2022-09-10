import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const [showSidebar, setshowSidebar] = useState<boolean>(true);
  function toggleSideBar() {
    setshowSidebar(!showSidebar);
  }
  return (
    <>
      <header>
        <Navbar />
      </header>
      <Temp />

      {/* <div className="flex pt-16 overflow-hidden bg-gray-50 dark:bg-gray-900 cursor-default">
        <div
          className={`relative w-full h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 ${
            showSidebar && 'lg:ml-64'
          }`}
        >
          <main>{children}</main>
        </div>
      </div> */}
    </>
  );
}

function Temp() {
  return (
    <main className="pt-8 pb-16 lg:pt-24 lg:pb-24 bg-white dark:bg-gray-900">
      <div className="flex justify-between px-4 mx-auto w-full">
        <div className="hidden mb-6 xl:block lg:w-72">
          <div className="sticky top-24">
            <aside aria-labelledby="categories-label">
              <h3 id="categories-label" className="sr-only">
                Categories
              </h3>
              <nav className="p-6 mb-6 font-medium text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700 dark:text-gray-400">
                <ul className="mb-6 space-y-4">
                  <li>
                    <a
                      href="#"
                      className="flex items-center text-primary-600 dark:text-primary-500"
                    >
                      Get installed wallets
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      Get a collection of assets

                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      Lock and unlock assets on smart contract

                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      Podcasts
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"></path>
                      </svg>{' '}
                      Videos
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      Tags
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      FAQ
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      Sponsors
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      About
                    </a>
                  </li>
                </ul>
                <h4 className="mb-4 text-gray-900 dark:text-white">Others</h4>
                <ul className="space-y-4">
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z"></path>
                        <path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"></path>
                      </svg>{' '}
                      Privacy policy
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      Terms of use
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="flex items-center hover:text-primary-600 dark:hover-text-primary-500"
                    >
                      <svg
                        className="mr-2 w-5 h-5"
                        aria-hidden="true"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>{' '}
                      Contact
                    </a>
                  </li>
                </ul>
              </nav>
            </aside>
            <aside>
              <div className="flex justify-center items-center mb-3 w-full h-32 bg-gray-100 rounded-lg dark:bg-gray-800">
                <svg
                  aria-hidden="true"
                  className="w-8 h-8 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                    clip-rule="evenodd"
                  ></path>
                </svg>
              </div>
              <p className="mb-2 text-sm font-light text-gray-500 dark:text-gray-400">
                Students and Teachers, save up to 60% on Flowbite Creative
                Cloud.
              </p>
              <p className="text-xs font-light text-gray-400 uppercase dark:text-gray-500">
                Ads placeholder
              </p>
            </aside>
          </div>
        </div>
        <article className="mx-auto w-full max-w-none format format-sm sm:format-base lg:format-lg format-blue dark:format-invert pl-8 pr-8">
          <header className="mb-4 lg:mb-6">
            <h1 className="mb-4 text-3xl font-extrabold leading-tight text-gray-900 lg:mb-6 lg:text-4xl dark:text-white">
              Prototyping from A to Z: best practices for successful prototypes
            </h1>
            <p className="lead">
              For connecting, queries and performs wallet functions in
              accordance to{' '}
              <a
                href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
                target="_blank"
                rel="noreferrer"
              >
                CIP-30
              </a>
              .
            </p>
          </header>
          <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-4 pb-16">
            <div className="col-span-1 xl:col-auto">
              <p>
                These wallets APIs are in accordance to{' '}
                <a
                  href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
                  target="_blank"
                  rel="noreferrer"
                >
                  CIP-30
                </a>
                , which defines the API for dApps to communicate with the user's
                wallet. Additional utility functions provided for developers
                that are useful for building dApps.
              </p>

              <p className="font-medium">
                In this section, you can connect wallet and try APIs for dApps
                to communicate with your wallet. To start, import BrowserWallet
                with:
              </p>
              <pre>
                <code className="language-js">
                  const result = BrowserWallet.getInstalledWallets();
                </code>
              </pre>
            </div>
          </div>

          <h2>Get a collection of assets</h2>
          <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-4 pb-16">
            <div className="col-span-1 xl:col-auto">
              <p>Returns a list of wallets installed on user's device.</p>
              <pre>
                <code className="language-js">
                  const result = BrowserWallet.getInstalledWallets();
                </code>
              </pre>
            </div>

            <div className="col-span-1 xl:col-auto">
              <div className="block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Noteworthy technology acquisitions 2021
                </h5>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
              </div>
            </div>
          </div>


          <h2>Lock and unlock assets on smart contract</h2>
          <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-4 pb-16">
            <div className="col-span-1 xl:col-auto">
              <p>Returns a list of wallets installed on user's device.</p>
              <pre>
                <code className="language-js">
                  const result = BrowserWallet.getInstalledWallets();
                </code>
              </pre>
            </div>

            <div className="col-span-1 xl:col-auto">
              <div className="block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Noteworthy technology acquisitions 2021
                </h5>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
              </div>
            </div>
          </div>


          <h2>Get installed wallets</h2>
          <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-4 pb-16">
            <div className="col-span-1 xl:col-auto">
              <p>Returns a list of wallets installed on user's device.</p>
              <pre>
                <code className="language-js">
                  const result = BrowserWallet.getInstalledWallets();
                </code>
              </pre>
            </div>

            <div className="col-span-1 xl:col-auto">
              <div className="block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Noteworthy technology acquisitions 2021
                </h5>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  Here are the biggest enterprise technology acquisitions of
                  2021 so far, in reverse chronological order.
                </p>
              </div>
            </div>
          </div>


        </article>
      </div>
    </main>
  );
}
