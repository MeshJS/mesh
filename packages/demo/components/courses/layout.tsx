import Metatags from '../site/metatags';

export default function CourseLayout({
  children,
  coursesSidebar,
  title,
  desc,
  youtubeId,
}: {
  children;
  coursesSidebar;
  title;
  desc;
  youtubeId?;
}) {
  return (
    <>
      <Metatags title={title} description={desc} />
      <div className="flex">
        <div className="hidden lg:block">{coursesSidebar}</div>
        <div className="w-full h-full bg-gray-50 lg:ml-64 dark:bg-gray-900 pb-8">
          <main>
            {youtubeId && (
              <div className="w-full">
                <div className="w-full p-8 pt-4">
                  <iframe
                    className="mx-auto w-full rounded-lg aspect-video"
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
              </div>
            )}
            <div className="flex justify-between px-4 mx-auto max-w-screen-xl mt-4">
              <article className="mx-auto w-full max-w-2xl format format-sm sm:format-base lg:format-lg format-blue dark:format-invert">
                <header className="mb-4 lg:mb-6 not-format">
                  <h1 className="mb-4 text-3xl font-extrabold leading-tight text-gray-900 lg:mb-6 lg:text-4xl dark:text-white">
                    {title}
                  </h1>
                </header>
                <p className="lead">{desc}</p>
                {children}
              </article>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
