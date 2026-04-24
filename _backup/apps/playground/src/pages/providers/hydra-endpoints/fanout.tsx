import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraFanout({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="fanout"
      title="Fanout"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Finalize a head after the contestation period passed. This will
        distribute the final (as closed and maybe contested) head state back on
        the layer 1.
      </p>
      <Codeblock data={`await provider.fanout();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    await provider.fanout();
  }

  return (
    <LiveCodeDemo
      title="Fanout"
      subtitle="Finalize a head after the contestation period passed."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
