import ApisSidebar from './sidebar';

export default function ApisLayout({ children, sidebarItems }) {
  return (
    <>
      <div className="flex justify-between lg:px-4 mx-auto w-full">
        <ApisSidebar sidebarItems={sidebarItems} />
        <article className="mx-auto w-full max-w-none format lg:format-lg format-blue dark:format-invert px-4 pt-8 pb-32">
          {children}
        </article>
      </div>
    </>
  );
}
