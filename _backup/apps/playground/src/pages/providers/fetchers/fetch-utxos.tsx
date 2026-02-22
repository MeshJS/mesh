import { useState } from "react";

import { HydraProvider } from "@meshsdk/hydra";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers as _SupportedFetchers } from ".";

type SupportedFetchers = _SupportedFetchers | HydraProvider;

export default function FetcherUtxos({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
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
        provider,
        userInput,
        setUserInput,
        userInput2,
        setUserInput2,
        providerName,
      )}
    />
  );
}

function Left(userInput: string, userInput2: string) {
  return (
    <>
      <p>Get UTxOs for a given hash.</p>
      <Codeblock data={`await provider.fetchUTxOs('${userInput}')`} />
      <p>Optionally, you can specify the index of the index output.</p>
      <Codeblock
        data={`await provider.fetchUTxOs('hash_here', ${userInput2})`}
      />
    </>
  );
}

function Right(
  provider: SupportedFetchers,
  userInput: string,
  setUserInput: (value: string) => void,
  userInput2: string,
  setUserInput2: (value: string) => void,
  providerName: string,
) {
  async function runDemo() {
    return await provider.fetchUTxOs(
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
      runDemoProvider={providerName}
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
