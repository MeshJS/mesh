import { YaciProvider } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function YaciDevnetInfo({
  provider,
  providerName,
}: {
  provider: YaciProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="getDevnetInfo"
      title="Admin Get Devnet Info"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
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
      <Codeblock data={`await provider.getDevnetInfo()`} />
      <p>Example response:</p>
      <Codeblock data={code} />
    </>
  );
}

function Right(provider: YaciProvider, providerName: string) {
  async function runDemo() {
    return await provider.getDevnetInfo();
  }

  let code = `await provider.getDevnetInfo();`;

  return (
    <LiveCodeDemo
      title="Get Devnet Info"
      subtitle="Admin function to get devnet info"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      code={code}
    ></LiveCodeDemo>
  );
}
