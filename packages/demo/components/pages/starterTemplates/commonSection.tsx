import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';
import Card from '../../ui/card';

export default function CommonSection({
  title,
  desc,
  sidebarTo,
  installCode,
  demoUrl,
  repoUrl,
}) {
  return (
    <>
      <SectionTwoCol
        sidebarTo={sidebarTo}
        header={title}
        leftFn={Left(desc, installCode, demoUrl, repoUrl)}
        rightFn={Right()}
      />
    </>
  );
}

function Left(desc, installCode, demoUrl, repoUrl) {
  return (
    <Card>
      {desc}
      <Codeblock data={installCode} isJson={false} />
      <div className="flex flex-col mb-8 lg:mb-16 space-y-4 sm:flex-row sm:justify-start sm:space-y-0 sm:space-x-4">
        <a
          href={demoUrl}
          className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 no-underline"
          target="_blank"
          rel="noreferrer"
        >
          Demo Site
        </a>
        <a
          href={repoUrl}
          className="inline-flex justify-center items-center py-3 px-5 text-base font-medium text-center text-gray-900 rounded-lg border border-gray-300 hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:ring-gray-800 no-underline"
          target="_blank"
          rel="noreferrer"
        >
          GitHub Repo
        </a>
      </div>
    </Card>
  );
}

function Right() {
  return <></>;
}
