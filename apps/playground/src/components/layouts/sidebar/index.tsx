import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Link as RSLink, scroller } from "react-scroll";

import Link from "~/components/link";

export default function Sidebar({
  sidebarItems,
}: {
  sidebarItems: { to: string; label: string }[];
}) {
  const router = useRouter();
  useEffect(() => {
    if (router.asPath.includes("#")) {
      setTimeout(() => {
        const id = router.asPath.split("#")[1] as string;
        scroller.scrollTo(id, {
          duration: 500,
          smooth: true,
          offset: -100,
          spy: true,
        });
      }, 1000);
    }
  }, []);

  return (
    <div className="mb-6 mr-6 hidden lg:w-72 xl:block">
      <div className="sticky top-24">
        <aside>
          <nav className="h-[calc(100vh-150px)] overflow-y-auto rounded-lg border border-gray-200 p-6 font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <ul className="space-y-4">
              {sidebarItems.map((item, i) => {
                return (
                  <li key={i}>
                    {item.to.startsWith("/") || item.to.startsWith("http") ? (
                      <Link href={item.to}>{item.label}</Link>
                    ) : (
                      <LinkWithinPage key={i} item={item} />
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function LinkWithinPage({ item }: { item: { to: string; label: string } }) {
  return (
    <RSLink
      activeClass="text-primary-600 dark:text-primary-500"
      className="cursor-pointer hover:text-black dark:hover:text-white"
      to={item.to}
      spy={true}
      smooth={true}
      duration={500}
      offset={-100}
    >
      {item.label}
    </RSLink>
  );
}
