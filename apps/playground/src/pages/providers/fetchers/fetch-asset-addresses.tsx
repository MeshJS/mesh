import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAssetAddresses({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(demoAsset);
  return (
    <TwoColumnsScroll
      sidebarTo="fetchAssetAddresses"
      title="Fetch Asset Addresses"
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
        Fetch a list of a addresses containing a specific <code>asset</code>{" "}
        where it is the concatenation of policy ID and asset.
      </p>
      <Codeblock
        data={`await provider.fetchAssetAddresses('${userInput}')`}
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
    return await provider.fetchAssetAddresses(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Asset Addresses"
      subtitle="Fetch list of addresses containing a specific asset"
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
