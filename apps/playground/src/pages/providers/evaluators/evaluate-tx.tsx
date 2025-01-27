import { useState } from "react";

import { OfflineEvaluator } from "@meshsdk/core-csl";

import { getProvider } from "~/components/cardano/mesh-wallet";
import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoTransactionCborScript } from "~/data/cardano";
import { SupportedEvaluators } from ".";

export default function EvaluatorEvaluateTransaction({
  blockchainProvider,
  provider,
}: {
  blockchainProvider: SupportedEvaluators;
  provider: string;
}) {
  const [userInput, setUserInput] = useState<string>(demoTransactionCborScript);

  return (
    <TwoColumnsScroll
      sidebarTo="evaluateTx"
      title="Evaluate Transaction"
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
  let code1 = ``;
  code1 += `const unsignedTx = await tx.build();\n`;
  code1 += `const evaluateTx = await blockchainProvider.evaluateTx(unsignedTx);\n`;

  let demoResults = ``;
  demoResults += `[\n`;
  demoResults += `  {\n`;
  demoResults += `    "index": 0,\n`;
  demoResults += `    "tag": "SPEND",\n`;
  demoResults += `    "budget": {\n`;
  demoResults += `      "mem": 1700,\n`;
  demoResults += `      "steps": 368100\n`;
  demoResults += `    }\n`;
  demoResults += `  }\n`;
  demoResults += `]\n`;

  let codeRedeemer = ``;
  codeRedeemer += `const redeemer = {\n`;
  codeRedeemer += `  data: { alternative: 0, fields: [...] },\n`;
  codeRedeemer += `  budget: {\n`;
  codeRedeemer += `    mem: 1700,\n`;
  codeRedeemer += `    steps: 368100,\n`;
  codeRedeemer += `  },\n`;
  codeRedeemer += `};\n`;

  return (
    <>
      <p>
        <code>evaluateTx()</code> accepts an unsigned transaction (
        <code>unsignedTx</code>) and it evaluates the resources required to
        execute the transaction. Note that, this is only valid for transaction
        interacting with redeemer (smart contract). By knowing the budget
        required, you can use this to adjust the redeemer's budget so you don't
        spend more than you need to execute transactions for this smart
        contract.
      </p>
      <Codeblock data={code1} />
      <p>
        Example responses from unlocking assets from the always succeed smart
        contract.
      </p>
      <Codeblock data={demoResults} />
      <p>
        With the <code>mem</code> and <code>steps</code>, you can refine the
        budget for the redeemer. For example:
      </p>
      <Codeblock data={codeRedeemer} />
    </>
  );
}

function Right(
  blockchainProvider: SupportedEvaluators,
  userInput: string,
  setUserInput: (value: string) => void,
  provider: string,
) {
  async function runDemo() {
    const blockchainProvider = getProvider();
    const offlineeval = new OfflineEvaluator(blockchainProvider, "preprod");
    const evaluateTx = await offlineeval.evaluateTx(userInput);
    return evaluateTx;
  }

  let code = ``;
  code += `import { BlockfrostProvider } from "@meshsdk/core";\n`;
  code += `import { OfflineEvaluator } from "@meshsdk/core-csl";\n`;
  code += `\n`;
  code += `const blockchainProvider = new BlockfrostProvider('<Your-API-Key>');\n`;
  code += `const offlineeval = new OfflineEvaluator(blockchainProvider, "preprod");\n\n`;
  code += `const evaluateTx = await offlineeval.evaluateTx('<UNSIGNED-TX-HEX>');\n`;

  return (
    <LiveCodeDemo
      title="Evaluate Transaction"
      subtitle="Evaluate the resources required to execute a transaction"
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
            placeholder="Transaction CBOR"
            label="Transaction CBOR"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
