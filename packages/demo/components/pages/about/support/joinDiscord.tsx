export default function JoinDiscord() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6">
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Join our Discord Server
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Come and talk to us in our Discord server.
          </p>
          <a
            href="https://discord.gg/Z6AH9dahdH"
            className="inline-flex items-center text-white bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:focus:ring-primary-900"
            target="_blank"
            rel="noreferrer"
          >
            Join Mesh's Discord server
          </a>
        </div>
        <img
          className="w-full hidden sm:block"
          src="/support/logo-g8677b0968_640.png"
          alt="support"
        />
      </div>
    </section>
  );
}
