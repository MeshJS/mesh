import { HydraProvider } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraInitializeHead({
  hydraProvider,
  provider,
}: {
  hydraProvider: HydraProvider;
  provider: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="initHead"
      title="Initializes a new Hydra Head"
      leftSection={Left()}
      rightSection={Right(hydraProvider, provider)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Initializes a new Head. This command is a no-op when a Head is already
        open and the server will output an <code>CommandFailed</code> message
        should this happen.
      </p>
      <Codeblock data={`await hydraProvider.initializesHead();`} />
    </>
  );
}

function Right(hydraProvider: HydraProvider, provider: string) {
  async function runDemo() {
    hydraProvider.onMessage((message) => {
      console.log("HydraProvider received message", message);
    });
    await hydraProvider.connect();
    return await hydraProvider.initializesHead();
  }

  return (
    <LiveCodeDemo
      title="Initializes Hydra Head"
      subtitle="Initializes a new Head."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    ></LiveCodeDemo>
  );
}
