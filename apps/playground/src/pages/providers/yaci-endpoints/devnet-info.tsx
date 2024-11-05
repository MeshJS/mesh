import { YaciProvider } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function YaciDevnetInfo({
  yaciProvider,
  provider,
}: {
  yaciProvider: YaciProvider;
  provider: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="getDevnetInfo"
      title="Admin Get Devnet Info"
      leftSection={Left()}
      rightSection={Right(yaciProvider, provider)}
    />
  );
}

function Left() {
  let code = JSON.stringify(
    {
      nodePort: 0,
      submitApiPort: 0,
      socketPath: "string",
      protocolMagic: 0,
      slotLength: 0,
      blockTime: 0,
      epochLength: 0,
      p2pEnabled: true,
      startTime: 0,
      masterNode: true,
      adminNodeUrl: "string",
      era: "Byron",
      genesisProfile: "zero_fee",
      ogmiosPort: 0,
      kupoPort: 0,
      yaciStorePort: 0,
      socatPort: 0,
      prometheusPort: 0,
      blockProducer: true,
    },
    null,
    2,
  );
  return (
    <>
      <p>Get information about the devnet.</p>
      <Codeblock data={`await yaciProvider.getDevnetInfo()`} />
      <p>Example response:</p>
      <Codeblock data={code} />
    </>
  );
}

function Right(yaciProvider: YaciProvider, provider: string) {
  async function runDemo() {
    return await yaciProvider.getDevnetInfo();
  }

  let code = `await yaciProvider.getDevnetInfo();`;

  return (
    <LiveCodeDemo
      title="Get Devnet Info"
      subtitle="Admin function to get devnet info"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
      code={code}
    ></LiveCodeDemo>
  );
}
