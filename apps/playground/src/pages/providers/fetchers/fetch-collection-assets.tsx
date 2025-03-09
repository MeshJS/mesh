import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoPolicyId } from "~/data/cardano";
import { SupportedFetchers } from ".";

export default function FetcherCollectionAssets({
  provider,
  providerName,
}: {
  provider: SupportedFetchers;
  providerName: string;
}) {
  const [userInput, setUserInput] = useState<string>(demoPolicyId);
  return (
    <TwoColumnsScroll
      sidebarTo="fetchCollectionAssets"
      title="Fetch Collection Assets"
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
  let code2 = "";
  code2 += `{\n`;
  code2 += `  "assets": [\n`;
  code2 += `    {\n`;
  code2 += `      "unit": "${userInput}",\n`;
  code2 += `      "quantity": "1"\n`;
  code2 += `    },\n`;
  code2 += `  ],\n`;
  code2 += `  "next": 2\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        Fetch a list of assets belonging to a collection by providing its Policy
        ID.
      </p>

      <Codeblock
        data={`await provider.fetchCollectionAssets('${userInput}')`}
      />

      <p>
        The API will return a list of <code>assets</code> and a cursor{" "}
        <code>next</code>. If the cursor is not null, you can use it to fetch
        the next page of results. Here is an example of the response.
      </p>

      <Codeblock data={code2} />

      <p>
        The <code>fetchCollectionAssets</code> function also accepts an optional{" "}
        <code>cursor</code> parameter to fetch the next page of results. The
        default value is <code>1</code>.
      </p>

      <Codeblock
        data={`await fetchCollectionAssets(\n  policyId: string,\n  cursor = 1\n)`}
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
    return await provider.fetchCollectionAssets(userInput);
  }

  return (
    <LiveCodeDemo
      title="Fetch Collection Assets"
      subtitle="Fetch list of assets belonging to a collection and its quantity"
      runCodeFunction={runDemo}
      runDemoShowProviderInit={true}
      runDemoProvider={providerName}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Policy ID"
            label="Policy ID"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
