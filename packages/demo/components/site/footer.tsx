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
      link: 'https://twitter.com/MartifyLabs',
    },
    {
      icon: <SvgGithub className="w-5 h-5" />,
      link: 'https://github.com/MartifyLabs/mesh',
    },
  ];
  return (
    <footer className="bg-gray-50 dark:bg-gray-800">
      <div className="p-4 py-6 mx-auto max-w-screen-xl md:p-8 lg:-10">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-6">
          <div className="col-span-2">
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
              Mesh is an open-source library to advance Web3 development on Cardano.
            </p>
            <ul className="flex mt-5 space-x-6">
              {socials.map((social, i) => {
                return (
                  <li key={i}>
                    <a
                      href={social.link}
                      className="text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400"
                      key={i}
                    >
                      {social.icon}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* <div className="lg:mx-auto">
            <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
              Company
            </h2>
            <ul className="text-gray-500 dark:text-gray-400">
              <li className="mb-4">
                <a href="#" className=" hover:underline">
                  About
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Careers
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Brand Center
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Blog
                </a>
              </li>
            </ul>
          </div>
          <div className="lg:mx-auto">
            <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
              Help center
            </h2>
            <ul className="text-gray-500 dark:text-gray-400">
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Discord Server
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Twitter
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>
          <div className="lg:mx-auto">
            <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
              Legal
            </h2>
            <ul className="text-gray-500 dark:text-gray-400">
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Licensing
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Terms
                </a>
              </li>
            </ul>
          </div>
          <div className="lg:mx-auto">
            <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase dark:text-white">
              Download
            </h2>
            <ul className="text-gray-500 dark:text-gray-400">
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  iOS
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Android
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  Windows
                </a>
              </li>
              <li className="mb-4">
                <a href="#" className="hover:underline">
                  MacOS
                </a>
              </li>
            </ul>
          </div> */}
        </div>
        <hr className="my-6 border-gray-200 sm:mx-auto dark:border-gray-700 lg:my-8" />
        <span className="block text-sm text-center text-gray-500 dark:text-gray-400">
          © 2021-2022{' '}
          <a href="https://martify.io/" className="hover:underline">
            Mesh™ by Martify Labs
          </a>
          . All Rights Reserved.
        </span>
      </div>
    </footer>
  );
}
