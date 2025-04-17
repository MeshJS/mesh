import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAddressAssets({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetPayment,
  );

  return (
    <TwoColumnsScroll
      sidebarTo="fetchAddressAssets"
      title="Fetch Address Assets"
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
      <p>Fetch assets from an address.</p>
      <Codeblock
        data={`await provider.fetchAddressAssets('${userInput}')`}
      />
    </>
  );
}

function Right(
  provider: SupportedFetchers,
  userInput: string,
  setUserInput: (value: string) => void,
  providerName: string,
) {
  return (
    <>
      <FromAddress
        provider={provider}
        userInput={userInput}
        setUserInput={setUserInput}
        providerName={providerName}
      />
      <WithAsset
        provider={provider}
        userInput={userInput}
        setUserInput={setUserInput}
        providerName={providerName}
      />
    </>
  );
}

function FromAddress({
  provider,
  userInput,
  setUserInput,
  providerName,
}: {
  provider: SupportedFetchers;
  userInput: string;
  setUserInput: (value: string) => void;
  providerName: string;
}) {
  async function runDemo() {
    return await provider.fetchAddressAssets(userInput);
  }

  let code = `await provider.fetchAddressAssets(\n`;
  code += `  '${userInput}'\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch Address UTxOs"
      subtitle="Fetch UTxOs from address"
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
        ]}
      />
    </LiveCodeDemo>
  );
}

function WithAsset({
  provider,
  userInput,
  setUserInput,
  providerName,
}: {
  provider: SupportedFetchers;
  userInput: string;
  setUserInput: (value: string) => void;
  providerName: string;
}) {
  async function runDemo() {
    return await provider.fetchAddressAssets(userInput);
  }

  let code = `await provider.fetchAddressAssets(\n`;
  code += `  '${userInput}',\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch assets from address"
      subtitle="Fetch assets given an address"
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
        ]}
      />
    </LiveCodeDemo>
  );
}
