import { BlockfrostProvider } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useProviders } from "~/hooks/useProviders";

export default function HydraCommit({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="commit"
      title="Commit to Hydra Head"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Commit a particular UTxO to the head. This will make the UTxO available
        on the layer 2.
      </p>
      <Codeblock
        data={`await instance.commit("713bea65d48061121e9badb030e327a07302064e8122d6807646b96f30aa3208", 0);`}
      />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  const blockfrostKey = useProviders((state) => state.blockfrostKey);

  const blockfrost = new BlockfrostProvider(blockfrostKey ?? "");
  const instance = new HydraInstance({
    provider,
    fetcher: blockfrost,
    submitter: blockfrost,
  });
  async function runDemo() {
    await instance.commitFunds(
      "713bea65d48061121e9badb030e327a07302064e8122d6807646b96f30aa3208",
      0,
    );
  }

  return (
    <LiveCodeDemo
      title="Commit to Hydra Head"
      subtitle="Commit a utxo to the hydra head"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    ></LiveCodeDemo>
  );
}
