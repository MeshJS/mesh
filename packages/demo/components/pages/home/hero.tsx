import { useEffect, useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

export default function Hero() {
  const [isSSR, setIsSSR] = useState(true);
  useEffect(() => {
    setIsSSR(false);
  }, []);

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="max-w-screen-xl px-4 py-8 mx-auto lg:py-16">
        <div className="grid items-center gap-8 mb-8 lg:gap-12 lg:grid-cols-12">
          <div className="col-span-6 text-center sm:mb-6 lg:text-left lg:mb-0">
            <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl xl:text-6xl dark:text-white">
              Build applications on Cardano with ease
            </h1>
            <p className="max-w-xl mx-auto mb-6 font-light text-gray-500 lg:mx-0 xl:mb-8 md:text-lg xl:text-xl dark:text-gray-400">
              Mesh is an open-source library providing numerous tools to easily
              build powerful dApps on the Cardano blockchain.
            </p>
            <Link href="/getting-started">
              <div className="inline-flex items-center justify-center px-5 py-3 mr-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 cursor-pointer">
                Get started
                <ChevronRightIcon className="w-5 h-5 ml-2 -mr-1" />
              </div>
            </Link>
          </div>
          <div className="hidden lg:block col-span-6">
            {!isSSR ? (
              <video className="w-full" autoPlay muted>
                <source src="/home/starter-template-cli.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
