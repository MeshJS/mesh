import { useState } from "react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherHandle({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>("meshsdk");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchHandle"
      title="Fetch Handle"
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
        <Link href="https://adahandle.com/">ADA Handle</Link> allows users to
        use a human-readable "Handle" to associate an address.
      </p>
      <p>
        Each Handle is a unique NFT, minted and issued on the Cardano
        blockchain. These NFTs act as unique identifiers for the UTXO that they
        reside in.
      </p>
      <p>
        ADA Handle also released a CIP68 handle and this function will fetch the
        metadata of the handle.
      </p>
      <Codeblock
        data={`await provider.fetchHandle('${userInput}')`}
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
  async function runDemo() {
    return await provider.fetchHandle(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Handle"
      subtitle="Fetch handle metadata"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Handle"
            label="Handle"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
