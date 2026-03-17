import { HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraContest({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="contest"
      title="Contest"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Challenge the latest snapshot announced as a result of a head closure
        from another participant. Note that this necessarily contest with the
        latest snapshot known of your local Hydra node. Participants can only
        contest once.
      </p>
      <Codeblock data={`await provider.contest();`} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  async function runDemo() {
    await provider.contest();
  }

  return (
    <LiveCodeDemo
      title="Contest"
      subtitle="Challenge the latest snapshot announced."
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
