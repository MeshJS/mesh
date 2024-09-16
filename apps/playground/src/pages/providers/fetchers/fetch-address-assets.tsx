import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAddressAssets({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
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
      <p>Fetch assets from an address.</p>
      <Codeblock
        data={`await blockchainProvider.fetchAddressAssets('${userInput}')`}
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
  return (
    <>
      <FromAddress
        blockchainProvider={blockchainProvider}
        userInput={userInput}
        setUserInput={setUserInput}
        provider={provider}
      />
      <WithAsset
        blockchainProvider={blockchainProvider}
        userInput={userInput}
        setUserInput={setUserInput}
        provider={provider}
      />
    </>
  );
}

function FromAddress({
  blockchainProvider,
  userInput,
  setUserInput,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  userInput: string;
  setUserInput: (value: string) => void;
  provider: string;
}) {
  async function runDemo() {
    return await blockchainProvider.fetchAddressAssets(userInput);
  }

  let code = `await blockchainProvider.fetchAddressAssets(\n`;
  code += `  '${userInput}'\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch Address UTxOs"
      subtitle="Fetch UTxOs from address"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
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
  blockchainProvider,
  userInput,
  setUserInput,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  userInput: string;
  setUserInput: (value: string) => void;
  provider: string;
}) {
  async function runDemo() {
    return await blockchainProvider.fetchAddressAssets(userInput);
  }

  let code = `await blockchainProvider.fetchAddressAssets(\n`;
  code += `  '${userInput}',\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch assets from address"
      subtitle="Fetch assets given an address"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
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
