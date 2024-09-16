import { useState } from "react";

import { deserializeDatum } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function DeserializeDatum() {
  return (
    <TwoColumnsScroll
      sidebarTo="deserializeDatum"
      title="Deserialize Datum"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Deserialize a datum from a CBOR string to JSON object.</p>
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>("167a4a048d87fcee0425ed200615ff2356f472c6413472c6106b8c5da52e3fd0");

  async function runDemo() {
    return deserializeDatum(userInput);
  }

  let codeSnippet = `deserializeDatum('${userInput}');`;

  return (
    <LiveCodeDemo
      title="Deserialize Datum"
      subtitle="Deserialize a datum from a CBOR string to JSON object"
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
