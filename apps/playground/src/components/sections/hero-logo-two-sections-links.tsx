import { ArrowRightIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import Link from "../link";

export default function HeroLogoTwoSectionsLinks({
  logo,
  title,
  description,
  links,
}: {
  logo: React.ReactNode;
  title: string;
  description: string;
  links: MenuItem[];
}) {
  return (
    <section className="bg-white dark:bg-neutral-900">
      <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6 lg:py-24">
        <div className="text-center">{logo}</div>

        <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6">
          <div className="grid space-y-8 lg:grid-cols-2 lg:gap-12 lg:space-y-0">
            <div>
              <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
                {title}
              </h2>
              <p className="mb-4 text-neutral-500 sm:text-xl dark:text-neutral-400">
                {description}
              </p>
            </div>
            <div>
              {links.map((link) => (
                <Item key={link.link} item={link} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Item({ item }: { item: MenuItem }) {
  return (
    <Link
      href={item.link}
      className="border-primary-600 dark:border-primary-500 mb-6 flex items-center justify-between rounded-lg border-l-8 bg-white p-4 shadow hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
    >
      <div>
        <span className="mb-1 block text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
          {item.desc}
        </span>
        <span className="text-primary-600 dark:text-primary-300 text-xl font-semibold">
          {item.title}
        </span>
      </div>
      <ArrowRightIcon className="text-primary-600 dark:text-primary-500 h-6 w-6" />
    </Link>
  );
}
