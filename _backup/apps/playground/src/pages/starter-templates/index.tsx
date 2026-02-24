import type { NextPage } from "next";

import Link from "~/components/link";
import Metatags from "~/components/site/metatags";
import {
  starterTemplates,
  metaStarterTemplates,
  GITHUB_TEMPLATES_URL,
} from "~/data/links-starter-templates";
import CenterPadded from "~/components/layouts/root/center-padded";
import CenterAlignHeaderParagraph from "~/components/sections/center-align-header-paragraph";

const StarterTemplatesPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaStarterTemplates.title}
        description={metaStarterTemplates.desc}
      />
      <CenterPadded>
        <CenterAlignHeaderParagraph headerTitle={metaStarterTemplates.title}>
          {metaStarterTemplates.desc}
        </CenterAlignHeaderParagraph>

        <p className="mb-8 text-center text-neutral-500 dark:text-neutral-400">
          All starter templates are available on{" "}
          <Link href={GITHUB_TEMPLATES_URL} className="font-medium">
            GitHub
          </Link>
          . Use{" "}
          <code className="rounded bg-neutral-200 px-1.5 py-0.5 dark:bg-neutral-700">
            npx meshjs your-app-name
          </code>{" "}
          to scaffold with the Mesh CLI.
        </p>

        <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
          {starterTemplates.map((template) => (
            <div
              key={template.githubUrl}
              className="flex flex-col rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              <h3 className="mb-2 text-lg font-bold text-neutral-900 dark:text-white">
                {template.name}
              </h3>
              <p className="mb-4 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
                {template.description}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={template.githubUrl}
                  className="inline-flex items-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  Source on GitHub
                </Link>
                {template.liveUrl && (
                  <Link
                    href={template.liveUrl}
                    className="inline-flex items-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Live demo
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </CenterPadded>
    </>
  );
};

export default StarterTemplatesPage;
