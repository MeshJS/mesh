import { useState } from "react";
import Link from "~/components/link";

import { Data } from "@meshsdk/core";
import { resolveDataHash } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ResolveDataHash() {
  return (
    <TwoColumnsScroll
      sidebarTo="resolveDataHash"
      title="Resolve Data Hash"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Converts datum into hash. Getting the hash is useful when you need to
        query for the UTXO that contain the assets you need for your
        transaction's input.
      </p>
      <p>
        Explore <Link href="/apis/transaction">Transaction</Link> to learn more
        about designing Datum, and learn how to query for UTXOs containing the
        datum hash.
      </p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>("supersecretdatum");

  async function runDemo() {
    const datum: Data = userInput;
    const dataHash = resolveDataHash(datum);
    return dataHash;
  }

  let codeSnippet = `resolveDataHash('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Resolve Data Hash"
      subtitle="Convert datum into hash"
      code={codeSnippet}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            label="Datum"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
