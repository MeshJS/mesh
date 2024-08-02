import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAsset } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAssetAddresses({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(demoAsset);
  return (
    <TwoColumnsScroll
      sidebarTo="fetchAssetAddresses"
      title="Fetch Asset Addresses"
      leftSection={Left(userInput)}
      rightSection={Right(
        blockchainProvider,
        userInput,
        setUserInput,
        provider,
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
        data={`await blockchainProvider.fetchAssetAddresses('${userInput}')`}
      />
    </>
  );
}

function Right(
  blockchainProvider: SupportedFetchers,
  userInput: string,
  setUserInput: (value: string) => void,
  provider: string,
) {
  async function runDemo() {
    return await blockchainProvider.fetchAssetAddresses(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Asset Addresses"
      subtitle="Fetch list of addresses containing a specific asset"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
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
