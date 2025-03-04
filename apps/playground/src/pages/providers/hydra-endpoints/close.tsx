import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraClose({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="close"
      title="Close Hydra Head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Terminate a head with the latest known snapshot. This effectively moves
        the head from the Open state to the Close state where the contestation
        phase begin. As a result of closing a head, no more transactions can be
        submitted via NewTx.
      </p>
      <Codeblock data={`await provider.close();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    await provider.close();
  }

  return (
    <LiveCodeDemo
      title="Close Hydra Head"
      subtitle="Terminate a head with the latest known snapshot."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
