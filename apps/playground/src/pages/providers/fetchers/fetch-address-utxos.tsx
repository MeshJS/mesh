import { useState } from "react";

import { HydraProvider } from "@meshsdk/hydra";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses, demoAsset } from "~/data/cardano";
import { SupportedFetchers as _SupportedFetchers } from ".";

type SupportedFetchers = _SupportedFetchers | HydraProvider;

export default function FetcherAddressUtxos({
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
      sidebarTo="fetchAddressUtxos"
      title="Fetch Address UTxOs"
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
      <p>Fetch UTxOs controlled by an address.</p>
      <Codeblock
        data={`await provider.fetchAddressUTxOs('${userInput}')`}
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
    return await provider.fetchAddressUTxOs(userInput);
  }

  let code = `await provider.fetchAddressUTxOs(\n`;
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
  const [userInput2, setUserInput2] = useState<string>(demoAsset);

  async function runDemo() {
    return await provider.fetchAddressUTxOs(userInput, userInput2);
  }

  let code = `await provider.fetchAddressUTxOs(\n`;
  code += `  '${userInput}',\n`;
  code += `  '${userInput2}'\n`;
  code += `);\n`;

  return (
    <LiveCodeDemo
      title="Fetch UTxOs with Asset"
      subtitle="Fetch UTxOs from address with asset"
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
            placeholder="Asset"
            label="Asset"
            key={1}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
