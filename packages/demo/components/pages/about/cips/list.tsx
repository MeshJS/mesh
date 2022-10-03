import Codeblock from "../../../ui/codeblock";

export default function List() {
  return (
    <section className="bg-gray-50 dark:bg-gray-900">
      <div className="py-8 px-4 mx-auto max-w-screen-xl sm:py-16 lg:px-6">
        <div className="mx-auto max-w-screen-md text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Cardano Improvement Proposals Implemented
          </h2>
          <p className="font-light text-gray-500 dark:text-gray-400 sm:text-xl">
            Mesh ensures your dApp adheres to the standards provided by the
            Cardano Community
          </p>
        </div>
        <div className="space-y-8 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8 xl:gap-8 md:space-y-0">
          <Card title="CIP25" content={<>

            <Codeblock data={``} isJson={false} />
          
            import <code>AssetMetadata</code>
          </>} />
        </div>
      </div>
    </section>
  );
}

function Card({title, content}) {
  return (
    <div className="p-6 bg-white rounded shadow dark:bg-gray-800">
      <h3 className="mb-2 text-xl font-bold dark:text-white">{title}</h3>
      <p className="font-light text-gray-500 dark:text-gray-400">{content}</p>
    </div>
  );
}
