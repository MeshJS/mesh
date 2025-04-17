import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAssetMetadata({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(demoAsset);
  return (
    <TwoColumnsScroll
      sidebarTo="fetchAssetMetadata"
      title="Fetch Asset Metadata"
      leftSection={Left(userInput)}
      rightSection={Right(
        provider,
        userInput,
        setUserInput,
        providerName,
      )}
    />
  );
}

function Left(userInput: string) {
  return (
    <>
      <p>
        Fetch the asset metadata by providing asset's <code>unit</code>, which
        is the concatenation of policy ID and asset name in hex.
      </p>
      <Codeblock
        data={`await provider.fetchAssetMetadata('${userInput}')`}
      />
    </>
  );
}

function Right(
  provider: SupportedFetchers,
  userInput: string,
  setUserInput: (value: string) => void,
  providerName: string,
) {
  async function runDemo() {
    return await provider.fetchAssetMetadata(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Asset Metadata"
      subtitle="Fetch metadata from asset ID"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Asset Unit"
            label="Asset Unit"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
