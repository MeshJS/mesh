import React from "react";
import { ArrowRightIcon } from "@heroicons/react/24/solid";

import Link from "~/components/link";
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
  image?: string | React.ReactNode;
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
              className="mr-3 inline-flex items-center justify-center rounded-lg bg-gray-700 px-5 py-3 text-center text-base font-medium text-white hover:bg-gray-800"
            >
              {link.label}
              <ArrowRightIcon className="-mr-1 ml-2 h-5 w-5" />
            </Link>
          )}

          {code && <Codeblock data={code} />}

          {children && <div className="my-1">{children}</div>}
        </div>
        <div className="hidden lg:col-span-5 lg:mt-0 lg:flex">
          {image && typeof image === "string" ? <img src={image} /> : image}
        </div>
      </div>
    </section>
  );
}
