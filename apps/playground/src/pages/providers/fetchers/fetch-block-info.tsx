import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherBlockInfo({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    "79f60880b097ec7dabb81f75f0b52fedf5e922d4f779a11c0c432dcf22c56089",
  );

  return (
    <TwoColumnsScroll
      sidebarTo="fetchBlockInfo"
      title="Fetch Block Info"
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
        Fetch block infomation. You can get the hash from{" "}
        <code>fetchTxInfo()</code>.
      </p>
      <Codeblock
        data={`await blockchainProvider.fetchBlockInfo('${userInput}')`}
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
    return await blockchainProvider.fetchBlockInfo(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Block Info"
      subtitle="Fetch information about a block"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Block hash"
            label="Block hash"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
