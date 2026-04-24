import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherProposalInfo({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    "372d688faa77e146798b581b322c0f2981a9023764736ade5d12e0e4e796af8c",
  );
  const [userInput2, setUserInput2] = useState<string>("0");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchProposalInfo"
      title="Fetch Proposal Info"
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
      <p>
        Get information for a given governance proposal, identified by the
        txHash and proposal index
      </p>
      <Codeblock
        data={`await provider.fetchGovernanceProposal('${userInput}', ${userInput2})`}
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
    return await provider.fetchGovernanceProposal(
      userInput,
      Number(userInput2),
    );
  }

  return (
    <LiveCodeDemo
      title="Fetch Proposals"
      subtitle="Fetch Proposals for a given TxHash and certIndex"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="TxHash"
            label="TxHash"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="e.g. 0"
            label="CertIndex"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
