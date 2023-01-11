import Link from 'next/link';
import SvgDiscord from '../svgs/discord';
import SvgGithub from '../svgs/github';
import SvgTwitter from '../svgs/twitter';

export default function Footer() {
  const socials = [
    {
      icon: <SvgDiscord className="w-5 h-5" />,
      link: 'https://discord.gg/Z6AH9dahdH',
    },
    {
      icon: <SvgTwitter className="w-5 h-5" />,
      link: 'https://twitter.com/meshsdk',
    },
    {
      icon: <SvgGithub className="w-5 h-5" />,
      link: 'https://github.com/MeshJS/mesh',
    },
  ];
  return (
    <footer className="bg-gray-50 dark:bg-gray-800">
      <div className="p-4 py-6 mx-auto max-w-screen-xl md:p-8 lg:-10">
        <div className="grid grid-cols-1">
          <div className="">
            <div className="flex items-center mb-2 text-2xl font-semibold text-gray-900 sm:mb-0 dark:text-white">
              <div className="mr-2 h-8">
                <img
                  src="/logo-mesh/black/logo-mesh-black-32x32.png"
                  className="dark:hidden"
                  alt="logo"
                />
                <img
                  src="/logo-mesh/white/logo-mesh-white-32x32.png"
                  className="hidden dark:block"
                  alt="logo dark"
                />
              </div>
              Mesh
            </div>
            <p className="my-4 font-light text-gray-500 dark:text-gray-400">
              Mesh is an open-source library to advance Web3 development on
              Cardano.
            </p>
            <ul className="flex mt-5 space-x-6">
              {socials.map((social, i) => {
                return (
                  <li key={i}>
                    <a
                      href={social.link}
                      className="text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400"
                      key={i}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {social.icon}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <Sitemap />

        <hr className="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
        <span className="block text-sm text-center text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Mesh.{' '}
          <a
            href="https://github.com/MeshJS/mesh/blob/main/LICENSE.md"
            target="_blank"
            rel="noreferrer"
          >
            Apache-2.0 license
          </a>
          .
        </span>
      </div>
    </footer>
  );
}

function Sitemap() {
  return (
    <div className="p-4 py-6 mx-auto max-w-screen-xl md:p-8 lg:p-10">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-4">
        <div>
          <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
            Get Started
          </h2>
          <ul className="text-gray-500 dark:text-gray-400">
            <SitemapLinks href="/starter-templates" label="Starter Templates" />
            <SitemapLinks href="/guides" label="Guides" />
            <SitemapLinks
              href="/migration-manual-installation"
              label="Migration / Manual Installation"
            />
          </ul>
        </div>
        <div>
          <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
            Core APIs
          </h2>
          <ul className="text-gray-500 dark:text-gray-400">
            <SitemapLinks href="/apis/appwallet" label="App Wallet" />
            <SitemapLinks href="/apis/browserwallet" label="Browser Wallet" />
            <SitemapLinks href="/apis/transaction" label="Send Assets" />
            <SitemapLinks
              href="/apis/transaction/smart-contract"
              label="Smart Contracts"
            />
            <SitemapLinks
              href="/apis/transaction/minting"
              label="Minting and Burning Assets"
            />
            <SitemapLinks href="/apis/transaction/staking" label="Stake Pool" />
            <SitemapLinks href="/apis/resolvers" label="Resolvers" />
          </ul>
        </div>
        <div>
          <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
            Useful building blocks
          </h2>
          <ul className="text-gray-500 dark:text-gray-400">
            <SitemapLinks href="/react" label="React Components" />
            <SitemapLinks href="/providers" label="Providers" />
          </ul>
        </div>
        <div>
          <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
            About Mesh
          </h2>
          <ul className="text-gray-500 dark:text-gray-400">
            <SitemapLinks href="/about" label="FAQ" />
            <SitemapLinks href="/about/cips" label="Implemented CIPs" />
            <SitemapLinks href="/about/support-us" label="Support Us" />
          </ul>
        </div>
      </div>
    </div>
  );
}

function SitemapLinks({ href, label }) {
  return (
    <li className="mb-4">
      <a href={href}>
        <div className="hover:underline cursor-pointer">{label}</div>
      </a>
    </li>
  );
}
