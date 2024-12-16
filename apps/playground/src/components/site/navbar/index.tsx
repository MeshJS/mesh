import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Bars4Icon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

import Link from "~/components/link";
import SvgMesh from "~/components/svgs/mesh";
import { linksAbout } from "~/data/links-about";
import { linksApi } from "~/data/links-api";
import { linksResources } from "~/data/links-resources";
import { linksSolutions } from "~/data/links-solutions";
import { socials } from "~/data/social";
import { useDarkmode } from "~/hooks/useDarkmode";
import MenuItemDropdown from "./menu-item-dropdown";

export default function Navbar() {
  const isDark = useDarkmode((state) => state.isDark);
  const setDarkMode = useDarkmode((state) => state.setDarkMode);

  const [isSSR, setIsSSR] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const router = useRouter();

  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    setIsSSR(false);
  }, []);

  function toggle() {
    setDarkMode(!isDark);
  }

  function toggleMobileMenu() {
    setShowMobileMenu(!showMobileMenu);
  }

  function search() {
    router.push({
      pathname: "/search",
      query: { q: query },
    });
  }

  useEffect(() => {
    function setDarkTheme(bool: boolean) {
      if (bool) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    setDarkTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [router.asPath]);

  return (
    <header>
      <nav className="fixed z-30 w-full border-b border-gray-200 bg-white/80 px-4 py-2.5 backdrop-blur lg:px-6 dark:border-gray-700 dark:bg-gray-800/80">
        <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between">
          {/* left logo start */}
          <Link href="/" className="flex items-center">
            {!isSSR && (
              <>
                <SvgMesh
                  className="mr-3 h-6 sm:h-9"
                  fill={isDark ? "#ffffff" : "#000000"}
                />
              </>
            )}
            <span className="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
              Mesh
            </span>
          </Link>
          {/* left logo end */}

          {/* right icons start */}
          <div className="flex items-center lg:order-2">
            <div id="search-div" className="mr-3 hidden w-full lg:inline-block">
              <label
                htmlFor="search-bar"
                className="sr-only mb-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              >
                Search
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    className="h-5 w-5 text-gray-500 dark:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    ></path>
                  </svg>
                </div>
                <input
                  type="search"
                  id="search-bar"
                  className="focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-500 dark:focus:border-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 pl-10 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      search();
                    }
                  }}
                />
              </div>
            </div>

            {socials.map((social, i) => {
              return (
                <Link
                  href={social.link}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  key={i}
                  aria-label={social.link}
                >
                  {React.createElement(social.icon, { className: "w-6 h-6" })}
                </Link>
              );
            })}
            {!isSSR && (
              <button
                type="button"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                onClick={() => {
                  toggle();
                }}
                aria-label="Toggle dark mode"
              >
                {isDark ? (
                  <MoonIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <SunIcon className="h-4 w-4 text-gray-500" />
                )}
              </button>
            )}
            <button
              type="button"
              className="ml-1 inline-flex items-center rounded-lg p-2 text-sm text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 lg:hidden dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
              onClick={() => toggleMobileMenu()}
              aria-label="Toggle mobile"
            >
              <span className="sr-only">Open main menu</span>
              <Bars4Icon className={`${showMobileMenu && "hidden"} h-6 w-6`} />
              <XMarkIcon className={`${!showMobileMenu && "hidden"} h-6 w-6`} />
            </button>
          </div>
          {/* right icons end */}

          {/* middle menu start */}
          <div
            className={`${
              !showMobileMenu && "hidden"
            } w-full items-center justify-between lg:order-1 lg:flex lg:w-auto`}
          >
            <div className="mt-4 flex items-center lg:hidden">
              <label htmlFor="search-mobile" className="sr-only">
                Search
              </label>
              <div className="relative w-full">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    className="h-5 w-5 text-gray-500 dark:text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                </div>
                <input
                  type="search"
                  id="search-mobile"
                  className="focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-500 dark:focus:border-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10  text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Search for anything..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      search();
                    }
                  }}
                />
              </div>
              <button
                className="bg-primary-700 border-primary-700 hover:bg-primary-800 focus:ring-primary-300 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800 ml-2 inline-flex items-center rounded-lg border p-2.5 text-sm font-medium text-white focus:outline-none focus:ring-4"
                onClick={() => search()}
              >
                <svg
                  className="mr-2 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  ></path>
                </svg>{" "}
                Search
              </button>
            </div>
            <ul className="mt-4 flex flex-col font-medium lg:mt-0 lg:flex-row lg:space-x-8">
              <MenuItemDropdown title="SDK" items={linksApi} />
              <MenuItemDropdown title="Resources" items={linksResources} />
              <MenuItemDropdown title="Solutions" items={linksSolutions} />
              <MenuItemDropdown title="About" items={linksAbout} />
            </ul>
          </div>
          {/* middle menu end */}
        </div>
      </nav>
    </header>
  );
}
