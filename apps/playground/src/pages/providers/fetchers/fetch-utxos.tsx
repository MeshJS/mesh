import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherUtxos({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    "dfd2a2616e6154a092807b1ceebb9ddcadc0f22cf5c8e0e6b0757815083ccb70",
  );
  const [userInput2, setUserInput2] = useState<string>("0");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchUtxos"
      title="Fetch UTxOs"
      leftSection={Left(userInput, userInput2)}
      rightSection={Right(
        blockchainProvider,
        userInput,
        setUserInput,
        userInput2,
        setUserInput2,
        provider,
      )}
    />
  );
}

function Left(userInput: string, userInput2: string) {
  return (
    <>
      <p>Get UTxOs for a given hash.</p>
      <Codeblock data={`await blockchainProvider.fetchUTxOs('${userInput}')`} />
      <p>Optionally, you can specify the index of the index output.</p>
      <Codeblock
        data={`await blockchainProvider.fetchUTxOs('hash_here', ${userInput2})`}
      />
    </>
  );
}

function Right(
  blockchainProvider: SupportedFetchers,
  userInput: string,
  setUserInput: (value: string) => void,
  userInput2: string,
  setUserInput2: (value: string) => void,
  provider: string,
) {
  async function runDemo() {
    return await blockchainProvider.fetchUTxOs(
      userInput,
      userInput2.length > 0 ? parseInt(userInput2) : undefined,
    );
  }

  return (
    <LiveCodeDemo
      title="Fetch UTxOs"
      subtitle="Fetch UTxOs given hash"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Hash"
            label="Hash"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="e.g. 0"
            label="Index (optional)"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
