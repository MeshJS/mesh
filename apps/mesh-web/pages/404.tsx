import Link from 'next/link';

export default function Custom404() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl lg:py-16 lg:px-6">
        <div className="grid grid-cols-1 gap-4 justify-items-center">
          <div>
            <img src="https://flowbite.s3.amazonaws.com/blocks/marketing-ui/404/404-computer.svg" />
          </div>
          <div className="grid grid-cols-1 justify-items-center">
            <p className="mb-4 text-3xl tracking-tight font-bold text-gray-900 md:text-4xl dark:text-white">
              Whoops! This page doesn't exist.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
