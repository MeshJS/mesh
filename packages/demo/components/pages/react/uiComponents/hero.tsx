import { PaintBrushIcon } from '@heroicons/react/24/solid';

export default function Hero() {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">
              <PaintBrushIcon className="w-16 h-16" />
            </div>
            <span>UI Components</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          React frontend components to speed up your app development.
        </p>
      </header>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4 pb-16">
        <div className="col-span-2">
          <p>
            Mesh offers UI components you need to build your dApp, so you can
            jumpstart your next project and bring the user interface to life.
          </p>
          <p className="font-medium">
            This page describes the list of easy-to-use UI components provided
            by Mesh to help you build applications faster.
          </p>
        </div>
      </div>
    </>
  );
}
