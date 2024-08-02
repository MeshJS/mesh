import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherTransactionInfo({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    "f4ec9833a3bf95403d395f699bc564938f3419537e7fb5084425d3838a4b6159",
  );

  return (
    <TwoColumnsScroll
      sidebarTo="fetchTxInfo"
      title="Fetch Transaction Info"
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
        Fetch transaction infomation. Only confirmed transaction can be
        retrieved.
      </p>
      <Codeblock
        data={`await blockchainProvider.fetchTxInfo('${userInput}')`}
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
    return await blockchainProvider.fetchTxInfo(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Transaction Info"
      subtitle="Fetch information about a transaction"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Transaction hash"
            label="Transaction hash"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
