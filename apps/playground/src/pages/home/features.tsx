import React from "react";

import Link from "~/components/link";
import { linksApi } from "~/data/links-api";

export default function SectionFeatures() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6">
      <div className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0 lg:grid-cols-3 xl:grid-cols-4 xl:gap-8">
        {linksApi.map((item, i) => (
          <Item
            title={item.title}
            desc={item.desc}
            icon={item.icon}
            link={item.link}
            key={i}
          />
        ))}
      </div>
    </div>
  );
}

function Item({
  title,
  desc,
  icon,
  link,
}: {
  title: string;
  desc: string;
  link: string;
  icon?: any;
}) {
  return (
    <Link href={link}>
      <div className="rounded bg-white p-6 shadow dark:bg-gray-800 h-52">
        {icon && (
          <div className="bg-primary-100 dark:bg-primary-900 mb-4 flex h-10 w-10 items-center justify-center rounded lg:h-12 lg:w-12">
            {React.createElement(icon, {
              className:
                "text-primary-600 dark:text-primary-300 h-5 w-5 lg:h-6 lg:w-6",
            })}
          </div>
        )}
        <h3 className="mb-2 text-xl font-bold dark:text-white">{title}</h3>
        <p className="font-light text-gray-500 dark:text-gray-400">{desc}</p>
      </div>
    </Link>
  );
}
