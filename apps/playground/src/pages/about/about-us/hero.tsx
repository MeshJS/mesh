export default function AboutHero() {
  return (
    <section className="bg-neutral-700 bg-[url('https://flowbite.s3.amazonaws.com/blocks/marketing-ui/hero/coast-house-view.jpg')] bg-cover bg-center bg-no-repeat bg-blend-multiply ">
      <div className="z-1 relative mx-auto max-w-screen-xl px-4 py-8 text-white lg:py-16">
        <div className="mb-6 max-w-screen-lg lg:mb-0">
          <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight md:text-5xl lg:text-6xl">
            We advance the Cardano's tech stack
          </h1>
          <p className="mb-6 font-light text-neutral-400 md:text-lg lg:mb-8 lg:text-xl">
            Get started building blockchain applications with our
            enterprise-ready, well engineered, and professionally designed SDK,
            Mesh. From easy to use Transaction builder to low level APIs, from
            wallet integrations to data service providers, building a Web3
            application has never been this easy.
          </p>
          {/* <a
            href="#"
            className="bg-primary-700 hover:bg-primary-800 focus:ring-primary-900 dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800 inline-flex items-center rounded-lg px-5 py-3 text-center font-medium text-white focus:outline-none focus:ring-4"
          >
            Learn more about the plan
            <svg
              className="-mr-1 ml-2 h-5 w-5"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill-rule="evenodd"
                d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                clip-rule="evenodd"
              ></path>
            </svg>
          </a> */}
        </div>
        {/* <div className="mt-8 grid gap-8 border-t border-neutral-600 pt-8 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 lg:pt-12">
          <div>
            <h2 className="mb-1 text-lg font-bold">Fourth quarter 2021</h2>
            <p className="mb-1 text-sm text-neutral-400">
              We announced fourth quarter 2021 results
            </p>
            <a
              href="#"
              className="text-primary-500 inline-flex items-center text-sm font-semibold hover:underline"
            >
              Read more
              <svg
                className="ml-1 h-5 w-5"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </a>
          </div>
        </div> */}
      </div>
    </section>
  );
}
