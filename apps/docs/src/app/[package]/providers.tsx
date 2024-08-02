import { CodeGroup } from "@/components/Code";
import { Prose } from "@/components/Prose";
import Markdown from "react-markdown";

export default function IntroProviders() {
  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">
        <h1>Providers</h1>
        <p className="lead">Data providers for connecting to the blockchain</p>
        {/* <p>
          Something
        </p> */}
        {/* <h2 className="scroll-mt-24" id="getting-started">
          Getting started
        </h2>
        <p className="lead">
          To get started with Mesh, you need to install the latest version of
          Mesh with npm:
        </p>

        <CodeGroup title="" code={`npm install @meshsdk/core @meshsdk/react`}>
          <Markdown>npm install @meshsdk/core @meshsdk/react</Markdown>
        </CodeGroup> */}
      </Prose>
    </article>
  );
}
