import React from "react";
import Link from "next/link";

import Codeblock from "../text/codeblock";

export default function HeroTwoSections({
  children,
  title,
  description,
  image,
  link,
  code,
}: {
  children?: React.ReactNode;
  title: string;
  description: string;
  image: string | React.ReactNode;
  link?: { label: string; href: string };
  code?: string;
}) {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="mx-auto grid max-w-screen-xl px-4 py-8 lg:grid-cols-12 lg:gap-8 lg:py-16 xl:gap-0">
        <div className="mr-auto place-self-center lg:col-span-7">
          <h1 className="mb-4 max-w-2xl text-4xl font-extrabold leading-none tracking-tight md:text-5xl xl:text-6xl dark:text-white">
            {title}
          </h1>
          <p className="mb-6 max-w-2xl font-light text-gray-500 md:text-lg lg:mb-8 lg:text-xl dark:text-gray-400">
            {description}
          </p>

          {link && (
            <Link
              href={link.href}
              className="bg-primary-700 hover:bg-primary-800 mr-3 inline-flex items-center justify-center rounded-lg px-5 py-3 text-center text-base font-medium text-white"
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
              <svg
                className="-mr-1 ml-2 h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </Link>
          )}

          {code && <Codeblock data={code} />}

          {children && children}
        </div>
        <div className="hidden lg:col-span-5 lg:mt-0 lg:flex">
          {typeof image === "string" ? <img src={image} /> : image}
        </div>
      </div>
    </section>
  );
}
