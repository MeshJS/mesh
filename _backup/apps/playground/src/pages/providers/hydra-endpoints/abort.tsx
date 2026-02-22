import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraAbort({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="abort"
      title="Aborts a head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Aborts a head before it is opened. This can only be done before all
        participants have committed. Once opened, the head can't be aborted
        anymore but it can be closed using: `Close`.
      </p>
      <Codeblock data={`await provider.abort();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    await provider.abort();
  }

  return (
    <LiveCodeDemo
      title="Aborts a head"
      subtitle="Aborts a head before it is opened."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
