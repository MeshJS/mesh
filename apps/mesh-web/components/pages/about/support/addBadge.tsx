import Codeblock from '../../../ui/codeblock';

export default function AddBadge() {
  let code2 = `import { MeshBadge } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <MeshBadge />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <section className="bg-white dark:bg-gray-900">
      <div className="gap-8 items-center py-8 px-4 mx-auto max-w-screen-xl xl:gap-16 md:grid md:grid-cols-2 sm:py-16 lg:px-6">
        <img className="w-full hidden sm:block" src="/support/meshbadge.png" alt="support" />
        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Add Mesh Badge in your Application
          </h2>
          <p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
            Add our beautiful Mesh Badge to give your users confidence knowing
            that your application is running on top of a solid SDK.
          </p>
          <Codeblock data={code2} isJson={false} />
        </div>
      </div>
    </section>
  );
}
