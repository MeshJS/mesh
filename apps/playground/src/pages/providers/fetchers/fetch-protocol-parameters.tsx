import { useState } from "react";

import { HydraProvider } from "@meshsdk/hydra";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers as _SupportedFetchers } from ".";

type SupportedFetchers = _SupportedFetchers | HydraProvider;

export default function FetcherProtocolParameters({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>("");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchProtocolParameters"
      title="Fetch Protocol Parameters"
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
      <p>Fetch the latest protocol parameters.</p>
      <Codeblock
        data={`await provider.fetchProtocolParameters(${userInput ? parseInt(userInput) : ""})`}
      />
      <p>
        Optionally, you can provide an epoch number to fetch the protocol
        parameters of that epoch.
      </p>
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
    return await provider.fetchProtocolParameters(
      userInput ? parseInt(userInput) : undefined,
    );
  }

  return (
    <LiveCodeDemo
      title="Fetch Protocol Parameters"
      subtitle="Fetch protocol parameters of the blockchain by epoch"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
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
