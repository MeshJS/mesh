import Metatags from "~/components/site/metatags";
import Markdown from "./markdown";
import StickySidebar from "./sidebar/sticky-sidebar";

export default function LayoutImageHeaderAndBody({
  children,
  title,
  description,
  image,
  cover,
  sidebarItems,
  authors,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  image: string;
  cover: string;
  sidebarItems?: { to: string; label: string }[];
  authors?: { url: string; image: string; name: string; about: string }[];
}) {
  return (
    <>
      <Metatags title={title} description={description} image={cover} />
      <main className="bg-white pb-16 lg:pb-36 dark:bg-gray-900">
        <header
          style={{ backgroundImage: `url(${image})` }}
          className={`relative h-[460px] w-full bg-cover bg-center bg-no-repeat bg-blend-darken xl:h-[537px]`}
        >
          <div className="absolute left-0 top-0 h-full w-full bg-black bg-opacity-50"></div>
          <div className="absolute left-1/2 top-20 mx-auto w-full max-w-screen-xl -translate-x-1/2 px-4 xl:top-1/2 xl:-translate-y-1/2 xl:px-0">
            <h1 className="mb-4 max-w-4xl text-2xl font-extrabold leading-none text-white sm:text-3xl lg:text-4xl">
              {title}
            </h1>
            <p className="text-lg font-normal text-gray-300">{description}</p>
          </div>
        </header>
        <div className="relative z-20 -m-36 mx-4 flex max-w-screen-xl justify-between rounded-lg border border-gray-200 bg-white p-6 shadow-md xl:-m-32 xl:mx-auto xl:p-9 dark:border-gray-700 dark:bg-gray-800">
          <article className="format format-blue dark:format-invert prose prose-slate w-full max-w-none xl:w-[828px]">
            <Markdown>{children}</Markdown>
          </article>
          {sidebarItems && (
            <aside className="hidden xl:block" aria-labelledby="sidebar-label">
              <div className="sticky top-24 xl:w-[336px]">
                <h3 id="sidebar-label" className="sr-only">
                  Sidebar
                </h3>
                <div className="mb-8">
                  <StickySidebar
                    sidebarItems={sidebarItems}
                    authors={authors}
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </>
  );
}
