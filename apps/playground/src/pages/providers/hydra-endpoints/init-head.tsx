import { MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import { HydraProvider } from "@meshsdk/hydra";

import Button from "~/components/button/button";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraInitializeHead({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="initHead"
      title="Initializes a new Hydra Head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
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
      <Codeblock data={`await provider.init();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    provider.onMessage((message) => {
      console.log("Hydra onMessage", message);
      if (message.tag === "Greetings") {
        console.log("Greetings", JSON.stringify(message));
      }
    });
    provider.onStatusChange((status) => {
      console.log("Hydra status", status);
    });

    await provider.init();
  }

  return (
    <LiveCodeDemo
      title="Initializes Hydra Head"
      subtitle="Initializes a new Head."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
