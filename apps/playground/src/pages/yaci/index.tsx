import type { NextPage } from "next";
import Link from "~/components/link";
import { ChevronRightIcon } from "@heroicons/react/24/solid";

import Metatags from "~/components/site/metatags";
import { linksYaci, metaYaci } from "~/data/links-yaci";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaYaci.title} description={metaYaci.desc} />
      <section className="bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6 lg:py-24">
          <div className="text-center">
            <img
              className="mx-auto w-36 object-contain"
              src="/providers/yaci.png"
              alt="Yaci logo"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:mt-16 lg:grid-cols-2 lg:gap-16">
            <div>
              <div>
                <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                  Overview
                </h3>
                <p className="mt-2 text-lg font-normal text-gray-500 dark:text-gray-400">
                  Yaci DevKit revolutionizes the development process with a
                  custom Cardano devnet that can be created and reset in seconds
                  using the user-friendly Yaci CLI. This allows for rapid
                  iteration and experimentation, tailored to specific needs
                  through flexible configuration options. The default devnet is
                  optimized for speed, with customizable parameters for various
                  testing scenarios. Integrated tools like the lightweight chain
                  indexer "Yaci Store" and the browser-based "Yaci Viewer"
                  enhance transaction building and submission. Optional
                  components Ogmios and Kupo can be enabled to support client
                  SDKs, and the Docker Compose package simplifies deployment and
                  management. Yaci DevKit's compatibility with Blockfrost API
                  endpoints ensures seamless integration with client SDKs,
                  offering boundless development possibilities.
                </p>
              </div>

              <ul className="mt-8 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {linksYaci.map((link) => (
                  <li key={link.link} className="flex items-center gap-2.5">
                    <ChevronRightIcon className="h-5 w-5 text-green-500" />
                    <Link href={link.link}>
                      <span className="text-base font-normal text-gray-500 dark:text-gray-400">
                        {link.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* <div className="space-y-8">
            <div>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                Something
              </h3>
              <p className="mt-2 text-lg font-normal text-gray-500 dark:text-gray-400">
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio
                iste nam cupiditate, eveniet ab possimus quisquam accusantium,
                porro, vel temporibus molestiae rerum eaque vitae modi hic!
                Commodi ad quis ducimus?
              </p>
            </div>

            <div>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                Something
              </h3>
              <p className="mt-2 text-lg font-normal text-gray-500 dark:text-gray-400">
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio
                iste nam cupiditate, eveniet ab possimus quisquam accusantium,
                porro, vel temporibus molestiae rerum eaque vitae modi hic!
                Commodi ad quis ducimus?
              </p>
            </div>
          </div> */}
          </div>
        </div>
      </section>
    </>
  );
};

export default ReactPage;
