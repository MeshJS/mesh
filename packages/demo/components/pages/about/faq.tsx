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
            >
              Discord server
            </a>
          </p>
        </div>

        <div className="grid pt-8 text-left border-t border-gray-200 dark:border-gray-700 sm:gap-8 lg:gap-16 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Item
              header="Is Mesh open-source and open for contributions?"
              body={
                <>
                  Yes, Mesh is open-source and we welcome all contributions. If
                  you are a developer or designer who wishes to contribute,
                  connect with us. If there is something you wish that Mesh
                  could include, ideas, feedbacks, let us know!
                </>
              }
            />
          </div>
          <div>{/*  */}</div>
          <div>{/*  */}</div>
        </div>
      </div>
    </section>
  );
}

function Item({ header, body }) {
  return (
    <div className="mb-10">
      <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
        {header}
      </h3>
      <div className="text-gray-500 dark:text-gray-400">{body}</div>
    </div>
  );
}
