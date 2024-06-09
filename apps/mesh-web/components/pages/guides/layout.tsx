import Card from '../../ui/card';
import StickySidebar from '../../ui/stickySidebar';

export default function GuidesLayout({
  children,
  title,
  desc,
  sidebarItems,
  image,
  authors,
}: {
  children;
  title;
  desc;
  sidebarItems: { to: string; label: string }[];
  image;
  authors?: { url: string; image: string; name: string; about: string }[];
}) {
  return (
    <main className="pb-16 lg:pb-24 bg-white dark:bg-gray-900 mb-4">
      <header
        style={{ backgroundImage: `url(${image})` }}
        className={`w-full h-[460px] xl:h-[537px] bg-no-repeat bg-cover bg-center bg-blend-darken relative`}
      >
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50"></div>
        <div className="absolute top-20 left-1/2 px-4 mx-auto w-full max-w-screen-xl -translate-x-1/2 xl:top-1/2 xl:-translate-y-1/2 xl:px-0">
          <h1 className="mb-4 max-w-4xl text-2xl font-extrabold leading-none text-white sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="text-lg font-normal text-gray-300">{desc}</p>
        </div>
      </header>
      <div className="flex relative z-20 justify-between p-6 -m-36 mx-4 max-w-screen-xl bg-white dark:bg-gray-800 xl:-m-32 xl:p-9 xl:mx-auto rounded-lg border border-gray-200 shadow-md dark:border-gray-700">
        <article className="xl:w-[828px] w-full max-w-none format format-blue dark:format-invert">
          {children}
        </article>
        <aside className="hidden xl:block" aria-labelledby="sidebar-label">
          <div className="xl:w-[336px] sticky top-24">
            <h3 id="sidebar-label" className="sr-only">
              Sidebar
            </h3>
            <div className="mb-8">
              <StickySidebar sidebarItems={sidebarItems} authors={authors} />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
