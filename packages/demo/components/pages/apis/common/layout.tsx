import ApisSidebar from './sidebar';

export default function ApisLayout({ children, sidebarItems }) {
  return (
    <>
      {/* <Main /> */}
      {/* <div className="flex pt-16 overflow-hidden bg-gray-50 dark:bg-gray-900 cursor-default">
        <div
          className={`relative w-full h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 ${
            showSidebar && 'lg:ml-64'
          }`}
        >
          <main>{children}</main>
        </div>
      </div> */}

      <div className="flex justify-between lg:px-4 mx-auto w-full">
        <ApisSidebar sidebarItems={sidebarItems} />
        <article className="mx-auto w-full max-w-none format format-sm sm:format-base lg:format-lg format-blue dark:format-invert px-4 pl-8">
          {children}
        </article>
      </div>
    </>
  );
}
