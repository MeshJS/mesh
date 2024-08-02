import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherProtocolParameters({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>("");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchProtocolParameters"
      title="Fetch Protocol Parameters"
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
      <p>Fetch the latest protocol parameters.</p>
      <Codeblock
        data={`await blockchainProvider.fetchProtocolParameters(${userInput ? parseInt(userInput) : ""})`}
      />
      <p>
        Optionally, you can provide an epoch number to fetch the protocol
        parameters of that epoch.
      </p>
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
    return await blockchainProvider.fetchProtocolParameters(
      userInput ? parseInt(userInput) : undefined,
    );
  }

  return (
    <LiveCodeDemo
      title="Fetch Protocol Parameters"
      subtitle="Fetch protocol parameters of the blockchain by epoch"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Epoch"
            label="Epoch"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
