import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAccountInfo({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetStake,
  );
  return (
    <TwoColumnsScroll
      sidebarTo="fetchAccountInfo"
      title="Fetch Account Info"
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
      <p>Obtain information about a specific stake account.</p>
      <Codeblock
        data={`await blockchainProvider.fetchAccountInfo('${userInput}')`}
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
    return await blockchainProvider.fetchAccountInfo(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Account Info"
      subtitle="Fetch account info using stake address"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Stake Address"
            label="Stake Address"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
