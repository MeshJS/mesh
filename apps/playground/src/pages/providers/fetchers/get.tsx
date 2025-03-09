import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherGet({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    `/addresses/${demoAddresses.testnetPayment}/transactions`,
  );

  return (
    <TwoColumnsScroll
      sidebarTo="get"
      title="Get data from URL"
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
        You can fetch any data from the blockchain by providing the URL path.
      </p>
      <Codeblock data={`await provider.get('${userInput}')`} />
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
    return await provider.get(userInput);
  }

  return (
    <LiveCodeDemo
      title="Get data from URL"
      subtitle="Fetch data from the blockchain"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="URL"
            label="URL"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
