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
              Whoops! This page doesn&apos;t exist.
            </p>
            <p className="mb-4 text-lg font-light text-gray-500 dark:text-gray-400">
              Here are some helpful links:
            </p>
            <div className="grid grid-cols-3 gap-1 justify-items-center">
              <Link href={'/get-started'}>Getting Started</Link>
              <Link href={'/wallet'}>Wallet</Link>
              <Link href={'/transaction'}>Transaction</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
