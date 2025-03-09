import { useState } from "react";

import { YaciProvider } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";

export default function YaciImportProvider() {
  return (
    <TwoColumnsScroll
      sidebarTo="provider"
      title="Import Yaci Provider"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        First, We import <code>YaciProvider</code>
      </p>
      <Codeblock
        data={`import { YaciProvider } from "@meshsdk/core";\n\nconst provider = new YaciProvider('<YACI_URL>', '<OPTIONAL_ADMIN_URL>');`}
      />
      <p>
        By default, the <code>YaciProvider</code> will use the default URL,{" "}
        <code>https://yaci-node.meshjs.dev/api/v1/</code>. If you want to use a custom
        URL, you can pass it as a parameter.
      </p>
      <p>
        In this example, we initialize the <code>YaciProvider</code> and fetch
        the UTxOs of an address.
      </p>
      <p>
        You can topup ADA in your wallet by running the following command from
        devne in order to fetch the UTxOs of an address.
      </p>
      <Codeblock
        data={`devnet:default>topup ${demoAddresses.testnetPayment} 1000`}
      />
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(
    demoAddresses.testnetPayment,
  );
  const [userInput2, setUserInput2] = useState<string>(
    "https://yaci-node.meshjs.dev/api/v1/",
  );

  async function runDemo() {
    const provider = new YaciProvider(userInput2);
    const utxos = await provider.fetchAddressUTxOs(userInput);
    return utxos;
  }

  let code = `import { YaciProvider } from "@meshsdk/core";\n\n`;
  code += `const provider = new YaciProvider('${userInput2}');\n`;
  code += `const utxos = await provider.fetchAddressUTxOs('${userInput}');\n`;

  return (
    <LiveCodeDemo
      title="Get UTxOs"
      subtitle="Fetch UTxOs of an address. Note: your Yaci devnet must be running."
      runCodeFunction={runDemo}
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
            placeholder="Yaci URL"
            label="Yaci URL"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
