import { useEffect, useState } from 'react';
import Link from 'next/link';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
  SunIcon,
  MoonIcon,
  Bars4Icon,
  XMarkIcon,
  WalletIcon,
  ChevronDownIcon,
  BanknotesIcon,
  WrenchScrewdriverIcon,
  BoltIcon,
  RocketLaunchIcon,
  PaintBrushIcon,
  DocumentTextIcon,
  HeartIcon,
  ShoppingCartIcon,
  CubeTransparentIcon,
  PaperAirplaneIcon,
  NewspaperIcon,
  FireIcon,
  ArrowsPointingInIcon,
  CloudIcon,
} from '@heroicons/react/24/solid';
import SvgGithub from '../svgs/github';
import SvgMesh from '../svgs/mesh';
import { useRouter } from 'next/router';

export default function Navbar() {
  const [darkMode, setDarkMode] = useLocalStorage('darkmode', false);
  const [isSSR, setIsSSR] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsSSR(false);
  }, []);

  function setDarkTheme(bool) {
    if (bool) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setDarkMode(bool);
  }

  function toggle() {
    setDarkMode(!darkMode);
  }

  function toggleMobileMenu() {
    setShowMobileMenu(!showMobileMenu);
  }

  useEffect(() => {
    setDarkTheme(darkMode);
  }, [darkMode]);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [router.asPath]);

  return (
    <header>
      <nav className="border-gray-200 px-4 lg:px-6 py-2.5 fixed z-30 w-full border-b dark:border-gray-700 bg-white/80 backdrop-blur dark:bg-gray-800/80">
        <div className="flex flex-wrap justify-between items-center mx-auto max-w-screen-xl">
          <a href="/" className="flex items-center">
            {!isSSR && (
              <>
                <SvgMesh
                  className="mr-3 h-6 sm:h-9"
                  fill={darkMode ? '#ffffff' : '#000000'}
                />
              </>
            )}
            <span className="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
              Mesh
            </span>
          </a>
          <div className="flex items-center lg:order-2">
            <a
              href="https://github.com/MeshJS/mesh"
              target="_blank"
              rel="noreferrer"
              className="p-2 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700"
            >
              <SvgGithub className="w-6 h-6" />
            </a>
            {!isSSR && (
              <button
                type="button"
                className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none rounded-lg text-sm p-2.5"
                onClick={() => {
                  toggle();
                }}
              >
                {darkMode ? (
                  <MoonIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <SunIcon className="h-4 w-4 text-gray-500" />
                )}
              </button>
            )}

            <button
              type="button"
              className="inline-flex items-center p-2 ml-1 text-sm text-gray-500 rounded-lg lg:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
              onClick={() => toggleMobileMenu()}
            >
              <span className="sr-only">Open main menu</span>
              <Bars4Icon className={`${showMobileMenu && 'hidden'} w-6 h-6`} />
              <XMarkIcon className={`${!showMobileMenu && 'hidden'} w-6 h-6`} />
            </button>
          </div>
          <div
            className={`${
              !showMobileMenu && 'hidden'
            } justify-between items-center w-full lg:flex lg:w-auto lg:order-1"
            id="mobile-menu-2`}
          >
            <ul className="flex flex-col mt-4 font-medium lg:flex-row lg:space-x-8 lg:mt-0">
              {/* <NavLink href="/guides" label="Guides" /> */}
              <SubMenuGetStarted />
              <SubMenuWallet />
              <SubMenuTransaction />
              <SubMenuReact />
              {/* <NavLink href="/providers" label="Providers" /> */}
              <SubMenuUtilities />

              {/* <SubMenuSmartContracts /> */}
              <SubMenuAbout />
              {/* <NavLink href="/about" label="About" /> */}
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
}

function SubMenuGetStarted() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        Get Started <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/guides`}
              title="Guides"
              desc="Step by step guides to build on Cardano"
              icon={<DocumentTextIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/starter-templates`}
              title="Starter Templates"
              desc="Kick start your projects with our templates using CLI"
              icon={<CubeTransparentIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/migration-manual-installation`}
              title="Migration / Manual Installation"
              desc="Install Mesh into your existing project"
              icon={<WrenchScrewdriverIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuWallet() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        Wallet <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>

      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/apis/appwallet`}
              title="App Wallet"
              desc="Wallet for building amazing applications"
              icon={<WalletIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/apis/browserwallet`}
              title="Browser Wallet"
              desc="Connect and perform wallet functions on Web3 dApps"
              icon={<BanknotesIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuSmartContracts() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        Smart Contracts{' '}
        <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/smart-contracts/marketplace-v1`}
              title="Marketplace"
              desc="Build a NFT marketplace effortlessly."
              icon={<ShoppingCartIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuTransaction() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        Transaction <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/apis/transaction`}
              title="Send assets"
              desc="Transactions for sending assets"
              icon={<PaperAirplaneIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/apis/transaction/smart-contract`}
              title="Interact with smart contracts"
              desc="Transactions to work with smart contracts"
              icon={<NewspaperIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/apis/transaction/minting`}
              title="Minting and burning assets"
              desc="Using ForgeScript for minting and burning native assets"
              icon={<FireIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/apis/transaction/staking`}
              title="Staking and stake pool"
              desc="Transactions for delegating ADA and managing stakepools"
              icon={<ArrowsPointingInIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuUtilities() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        Utilities <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/providers`}
              title="Providers"
              desc="Services provided by the Cardano developer community"
              icon={<CloudIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/apis/resolvers`}
              title="Resolvers"
              desc="Functions that you need while building dApps"
              icon={<WrenchScrewdriverIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuAbout() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        About <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/about`}
              title="About Mesh"
              desc="Information and common questions about Mesh"
              icon={<WalletIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/about/cips`}
              title="Implemented CIPs"
              desc="Mesh adhere to standards"
              icon={<BanknotesIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/about/support-us`}
              title="Support Us"
              desc="Ways you can support us!"
              icon={<HeartIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuReact() {
  const [showSubmenu, setShowSubmenu] = useState(false);
  return (
    <li
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
      onClick={() => setShowSubmenu(!showSubmenu)}
    >
      <button className="flex justify-between items-center py-2 pr-4 pl-3 w-full font-medium text-gray-700 border-b border-gray-100 lg:w-auto hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700">
        React <ChevronDownIcon className="ml-1 w-5 h-5 lg:w-4 lg:h-4" />
      </button>
      <div
        className={`grid ${
          !showSubmenu && 'hidden'
        } absolute z-10 w-full bg-white border border-gray-100 shadow-md dark:border-gray-700 lg:rounded-lg lg:w-auto lg:grid-cols-1 dark:bg-gray-700`}
      >
        <div className="p-2 text-gray-900 bg-white lg:rounded-lg dark:text-white lg:col-span-1 dark:bg-gray-800">
          <ul>
            <SubMenuLinks
              href={`/react/getting-started`}
              title="Getting Started"
              desc="Everything you need to build web3 app on React"
              icon={<RocketLaunchIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/react/ui-components`}
              title="UI Components"
              desc="UI components to speed up your app development"
              icon={<PaintBrushIcon className="w-5 h-5" />}
            />
            <SubMenuLinks
              href={`/react/wallet-hooks`}
              title="Wallet Hooks"
              desc="Hooks for interacting with connected wallet"
              icon={<BoltIcon className="w-5 h-5" />}
            />
          </ul>
        </div>
      </div>
    </li>
  );
}

function SubMenuLinks({ href, title, desc, icon }) {
  return (
    <li>
      <a href={href}>
        <div className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
          <div className="p-2 mr-4 bg-white rounded-lg shadow dark:bg-gray-700">
            {icon}
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm font-light text-gray-500 dark:text-gray-400">
              {desc}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}

function NavLink({ href, label }) {
  return (
    <li>
      <Link href={href}>
        <span className="flex items-center py-2 pr-4 pl-3 text-gray-700 border-b border-gray-100 hover:bg-gray-50 lg:hover:bg-transparent lg:border-0 lg:hover:text-primary-600 lg:p-0 dark:text-gray-400 lg:dark:hover:text-primary-500 dark:hover:bg-gray-700 dark:hover:text-white lg:dark:hover:bg-transparent dark:border-gray-700 cursor-pointer">
          {label}
        </span>
      </Link>
    </li>
  );
}
