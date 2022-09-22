import Link from 'next/link';

export default function AboutFaq() {
  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
        <div className="mx-auto max-w-screen-lg text-center">
          <h2 className="mb-2 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Information and Questions
          </h2>
          <p className="mb-8 text-gray-500 lg:text-lg dark:text-gray-400">
            Ask us anything on our{' '}
            <a
              href="https://discord.gg/Z6AH9dahdH"
              rel="noreferrer"
              className="link"
              target="_blank"
            >
              Discord server
            </a>
          </p>
        </div>

        <div className="grid pt-8 text-left border-t border-gray-200 dark:border-gray-700 sm:gap-8 lg:gap-16 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Item
              header={`Why Mesh?`}
              body={
                <>
                  <p>
                    If we look up the definition of the word "
                    <a
                      href="https://dictionary.cambridge.org/dictionary/english/mesh"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      Mesh
                    </a>
                    ":{' '}
                  </p>
                  <ul>
                    <li>
                      <i>
                        when different things or people mesh, they suit each
                        other or work well together
                      </i>
                    </li>
                    <li>
                      <i>
                        (of two or more things) to fit together or be suitable
                        for each other
                      </i>
                    </li>
                  </ul>
                  <p>
                    Like a well-woven fabric, Mesh connects business goals with
                    technology stacks. It enables developers (<i>resource</i>)
                    to build applications (<i>product</i>) according to project
                    requirements (<i>business</i>) on the blockchain (
                    <i>technology</i>). Mesh is filling the gap by making
                    product development accessible on Cardano.
                  </p>
                  <p>
                    Whether you're a beginner developer, startup, web3 market
                    leader, or a large enterprise, Mesh makes web3 development
                    easy with reliable, scalable, and well-engineered APIs &
                    developer tools.
                  </p>
                </>
              }
            />
          </div>
          <div>
            <Item
              header="Is Mesh open source and open for contributions?"
              body={
                <>
                  <p>
                    Yes, Mesh is open source and we welcome all contributions.
                    Developers, business, and writers can contribute in various
                    ways. You can write, test, or review the codes; you can
                    architect your project and design your product to use Mesh;
                    you can also improve or write new documentation and guides
                    to help other builders; you can also provide feedback,
                    ideas, improvements, feature requests.
                  </p>
                  <p>
                    Connect chat with us at our{' '}
                    <a
                      href="https://discord.gg/Z6AH9dahdH"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      Discord server
                    </a>{' '}
                    or email us at{' '}
                    <a
                      href="mailto:contact@martify.io"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      contact@martify.io
                    </a>
                    .
                  </p>
                </>
              }
            />
          </div>
          <div>
            <Item
              header="Who are behind Mesh?"
              body={
                <>
                  <p>
                    Mesh is develop and architect by{' '}
                    <a
                      href="https://martify.io/"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      Martify
                    </a>
                    . We build intuitive and well-engineered tools and services
                    for creators and companies who plan to develop on Cardano.
                  </p>
                  <p>
                    As Mesh is open source, the people behind Mesh includes the
                    Cardano community. We wish for more developers and writers
                    to join us building this amazing tool. The users of Cardano
                    applications are also indirectly behind Mesh, as where there
                    are users, that will attract developers to build more
                    applications.
                  </p>
                </>
              }
            />
            <Item
              header="About this Playground"
              body={
                <>
                  <p>
                    Mesh playground is an interactive documentation which allows
                    you to explore Mesh's features. Most APIs are interactive
                    where you can modify the inputs and see how you can use the
                    code in your project.
                  </p>
                  <p>
                    This website is build with{' '}
                    <a
                      href="https://nextjs.org/"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      Next.js
                    </a>{' '}
                    and designed with
                    <a
                      href="https://flowbite.com/"
                      rel="noreferrer"
                      className="link"
                      target="_blank"
                    >
                      Flowbite
                    </a>
                    .
                  </p>
                </>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Item({ header, body }) {
  return (
    <div className="mb-10 format">
      <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
        {header}
      </h3>
      <div className="text-gray-500 dark:text-gray-400">{body}</div>
    </div>
  );
}
