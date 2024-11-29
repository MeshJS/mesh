import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Link from "~/components/link";
import Metatags from "~/components/site/metatags";
import Header3 from "~/components/text/header3";
import { fund10, fund11, fund12, fund13, metaCatalyst } from "~/data/catalyst";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaCatalyst.title} description={metaCatalyst.desc} />
      <HeaderAndCards
        headerTitle={metaCatalyst.title}
        headerParagraph={metaCatalyst.desc}
      />
      <Section title="Fund 13" items={fund13} />
      <Section title="Fund 12" items={fund12} />
      <Section title="Fund 11" items={fund11} />
      <Section title="Fund 10" items={fund10} />
    </>
  );
};

export default ReactPage;

function Section({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="mx-auto max-w-screen-xl px-4 lg:px-6">
      <div className="mx-auto mb-8 px-4 text-left md:mb-16 lg:px-0">
        <Header3>{title}</Header3>
        <div className="grid w-full grid-cols-1 gap-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <CardLink
              title={item.title}
              desc={item.desc}
              url={item.url}
              completed={item.completed}
              tobecompleted={item.tobecompleted}
              status={item.status}
              key={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardLink({
  title,
  desc,
  url,
  completed,
  tobecompleted,
  status,
}: {
  title: string;
  desc: string;
  url?: string;
  completed: string[];
  tobecompleted: string[];
  status: string;
}) {
  function getDomain(url) {
    url = url.replace(/(https?:\/\/)?(www.)?/i, "");

    if (url.indexOf("/") !== -1) {
      return url.split("/")[0];
    }

    return url;
  }
  return (
    <div className="block max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
      <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h5>
      <div className="mb-2 flex gap-2">
        <span className="me-2 rounded bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
          {status}
        </span>
      </div>
      <p className="font-normal text-gray-700 dark:text-gray-400">{desc}</p>
      <ul className="mt-4 text-sm text-gray-500 dark:text-gray-300">
        {completed.map((item, index) => (
          <li key={index} className="flex">
            <div className="mr-2 h-4 w-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 text-sm text-gray-500 dark:text-gray-300">
        {tobecompleted.map((item, index) => (
          <li key={index} className="flex">
            <div className="mr-2 h-4 w-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {url && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-300">
          <Link href={url}>
            <span className="text-blue-500 hover:text-blue-700">
              {getDomain(url)}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
