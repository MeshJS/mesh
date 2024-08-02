import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoAsset } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherAddressUtxos({
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
      sidebarTo="fetchAddressUtxos"
      title="Fetch Address UTxOs"
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
      <p>Fetch UTxOs controlled by an address.</p>
      <Codeblock
        data={`await blockchainProvider.fetchAddressUTxOs('${userInput}')`}
      />
      <p>
        Optionally, you can filter UTXOs containing a particular asset by
        providing <code>asset</code>, where it is the concatenation of policy ID
        and asset.
      </p>
      <Codeblock
        data={`await fetchAddressUTxOs(address: string, asset?: string)`}
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
    return await blockchainProvider.fetchAddressUTxOs(userInput);
  }

  let code = `await blockchainProvider.fetchAddressUTxOs(\n`;
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
  const [userInput2, setUserInput2] = useState<string>(demoAsset);

  async function runDemo() {
    return await blockchainProvider.fetchAddressUTxOs(userInput, userInput2);
  }

  let code = `await blockchainProvider.fetchAddressUTxOs(\n`;
  code += `  '${userInput}',\n`;
  code += `  '${userInput2}'\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch UTxOs with Asset"
      subtitle="Fetch UTxOs from address with asset"
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
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
