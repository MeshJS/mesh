import { useState } from "react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedFetchers } from ".";

export default function FetcherHandleAddress({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedFetchers;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>("meshsdk");

  return (
    <TwoColumnsScroll
      sidebarTo="fetchHandleAddress"
      title="Fetch Handle Address"
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
        <Link href="https://adahandle.com/">ADA Handle</Link> allows users to
        use a human-readable "Handle" to associate an address.
      </p>
      <p>
        Each Handle is a unique NFT, minted and issued on the Cardano
        blockchain. These NFTs act as unique identifiers for the UTXO that they
        reside in.
      </p>
      <p>
        We can resolve the handle's address with <code>fetchHandleAddress</code>
        .
      </p>
      <Codeblock
        data={`await blockchainProvider.fetchHandleAddress('${userInput}')`}
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
    return await blockchainProvider.fetchHandleAddress(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Handle Address"
      subtitle="Fetch address by handle"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={provider}
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
