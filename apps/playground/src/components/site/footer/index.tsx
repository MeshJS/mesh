import React from "react";
import Image from "next/image";

import Link from "~/components/link";
import { socials } from "~/data/social";
import Sitemap from "./sitemap";

export default function Footer() {
  return (
    <footer className="bg-gray-50 dark:bg-gray-800">
      <div className="lg:-10 mx-auto max-w-screen-xl p-4 py-6 md:p-8">
        <div className="grid grid-cols-1">
          <div className="mb-2 flex items-center text-2xl font-semibold text-gray-900 sm:mb-0 dark:text-white">
            <div className="mr-2 h-8">
              <Image
                src="/logo-mesh/black/logo-mesh-black-32x32.png"
                className="dark:hidden"
                alt="logo"
                width={32}
                height={32}
              />
              <Image
                src="/logo-mesh/white/logo-mesh-white-32x32.png"
                className="hidden dark:block"
                alt="logo dark"
                width={32}
                height={32}
              />
            </div>
            Mesh
          </div>
          <p className="my-4 font-light text-gray-500 dark:text-gray-400">
            Mesh is an open-source library to advance Web3 development on
            Cardano.
          </p>
          <ul className="mt-5 flex space-x-6">
            {socials.map((social, i) => {
              return (
                <li key={i}>
                  <Link
                    href={social.link}
                    className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    key={i}
                  >
                    {React.createElement(social.icon, {
                      className: "w-5 h-5",
                    })}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <Sitemap />

        <hr className="my-6 border-gray-200 sm:mx-auto lg:my-8 dark:border-gray-700" />
        <span className="block text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Mesh.{" "}
          <Link href="https://github.com/MeshJS/mesh/blob/main/LICENSE.md">
            Apache-2.0 license
          </Link>
          .
        </span>
      </div>
    </footer>
  );
}
