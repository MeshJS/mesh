import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

import { searchQuery } from "~/backend/search";
import Link from "~/components/link";
import Metatags from "~/components/site/metatags";

export default function PageSearch() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<
    {
      title: string;
      url: string;
      snippet: string;
      displayUrl: string;
    }[]
  >([]);
  const lastSearchQuery = useRef("0");

  async function search(_query?: string) {
    const thisQuery = _query ? _query : query;
    console.log("search", thisQuery);
    lastSearchQuery.current = thisQuery;
    const res = await searchQuery(thisQuery);
    setSearchResults(res);
  }

  function handleSearch() {
    router.push({
      pathname: "/search",
      query: { q: query },
    });
  }

  useEffect(() => {
    if (router && router.query && router.query.q) {
      setQuery(router.query.q as string);
      search(router.query.q as string);
    }
  }, [router]);

  return (
    <>
      <Metatags title="Search Mesh SDK" />

      <section className="bg-white py-8 antialiased md:py-16 dark:bg-neutral-900">
        <div className="mx-auto max-w-screen-lg px-4 2xl:px-0">
          <div className="lg:flex lg:items-center lg:justify-between lg:gap-4">
            <h2 className="shrink-0 text-xl font-semibold text-neutral-900 sm:text-2xl dark:text-white">
              Search results ({searchResults.length})
            </h2>

            <div className="mt-4 w-full gap-4 sm:flex sm:items-center sm:justify-end lg:mt-0">
              <label htmlFor="simple-search" className="sr-only">
                Search
              </label>
              <div className="relative w-full flex-1 lg:max-w-sm">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
                  <svg
                    className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2"
                      d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  id="simple-search"
                  className="focus:border-primary-500 focus:ring-primary-500 dark:focus:border-primary-500 dark:focus:ring-primary-500 block w-full rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2.5 ps-9 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white dark:placeholder:text-neutral-400"
                  placeholder="Search Mesh Docs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                data-modal-target="question-modal"
                data-modal-toggle="question-modal"
                className="bg-primary-700 hover:bg-primary-800 focus:ring-primary-300 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800 mt-4 w-full shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-4 sm:mt-0 sm:w-auto"
                onClick={() => handleSearch()}
              >
                Search
              </button>
            </div>
          </div>

          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-neutral-200 dark:divide-neutral-800">
              {searchResults.map((result, i) => {
                return (
                  <Row
                    key={i}
                    title={result.title}
                    snippet={result.snippet}
                    url={result.url}
                    displayUrl={result.displayUrl}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Row({
  title,
  snippet,
  url,
  displayUrl,
}: {
  title: string;
  snippet: string;
  url: string;
  displayUrl: string;
}) {
  return (
    <div className="space-y-4 py-6 md:py-8">
      <div className="grid">
        <Link
          href={url}
          className="text-xl font-semibold text-neutral-900 hover:underline dark:text-white"
        >
          {title}
        </Link>
        <div className="text-sm text-neutral-500">
          <div dangerouslySetInnerHTML={{ __html: displayUrl }} />
        </div>
      </div>
      <div className="text-base font-normal text-neutral-500 dark:text-neutral-400">
        <div dangerouslySetInnerHTML={{ __html: snippet }} />
      </div>
    </div>
  );
}
