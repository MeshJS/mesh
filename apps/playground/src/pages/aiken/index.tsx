import type { NextPage } from "next";
import Link from "~/components/link";
import { ChevronRightIcon } from "@heroicons/react/24/solid";

import Metatags from "~/components/site/metatags";
import { linksAiken, metaAiken } from "~/data/links-aiken";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaAiken.title} description={metaAiken.desc} />
      <section className="bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6 lg:py-24">
          <div className="text-center">
            <img
              className="mx-auto w-36 object-contain dark:hidden"
              src="/images/aiken/logo-dark.png"
              alt="Aiken logo"
            />
            <img
              className="mx-auto hidden w-36 object-contain dark:block"
              src="/images/aiken/logo-light.png"
              alt="Aiken logo dark"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:mt-16 lg:grid-cols-2 lg:gap-16">
            <div>
              <div>
                <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                  Overview
                </h3>
                <p className="mt-2 text-lg font-normal text-gray-500 dark:text-gray-400">
                  Aiken is a functional programming language created for Cardano
                  smart contract development. It prioritizes on-chain execution
                  and offers a user-friendly approach for building secure and
                  efficient smart contracts, making it a valuable choice for
                  developers aiming to create robust on-chain applications.
                </p>
              </div>

              <ul className="mt-8 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {linksAiken.map((link) => (
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

            <div className="space-y-8">
              {/* <div>
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
            </div> */}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ReactPage;
