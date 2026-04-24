import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraConnect({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="connect"
      title="Connect Hydra Head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Connects to the Hydra Head. This command is a no-op when a Head is
        already open.
      </p>
      <Codeblock data={`await provider.connect();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    await provider.connect();
  }

  return (
    <LiveCodeDemo
      title="Connect Hydra Head"
      subtitle="Connect a new Head."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
