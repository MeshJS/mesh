import { useState } from "react";

import { YaciProvider } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function YaciTopupAddress({
  provider,
  providerName,
}: {
  provider: YaciProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="addressTopup"
      title="Admin Address Topup"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        You can topup ADA for any address. To topup ADA in your wallet, run the
        following command from devnet:
      </p>
      <Codeblock
        data={`await provider.addressTopup(<address>, <amount>)`}
      />
    </>
  );
}

function Right(provider: YaciProvider, providerName: string) {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetPayment,
  );
  const [userInput2, setUserInput2] = useState<string>("20000000");

  async function runDemo() {
    return await provider.addressTopup(userInput, userInput2);
  }

  let code = `await provider.addressTopup('${userInput}', '${userInput2}');`;

  return (
    <LiveCodeDemo
      title="Topup Address"
      subtitle="Admin function to topup address with ADA"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Address"
            label="Address"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Amount"
            label="Amount"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
