export default function CommonHero({ title, desc, icon }) {
  return (
    <>
      <header className="mb-4 lg:mb-6">
        <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
          <div className="flex items-center">
            <div className="p-2 mr-4">{icon}</div>
            <span>{title}</span>
          </div>
        </h2>
        <p className="mb-8 font-light text-gray-500 sm:text-xl dark:text-gray-400">
          {desc}
        </p>
      </header>
    </>
  );
}
