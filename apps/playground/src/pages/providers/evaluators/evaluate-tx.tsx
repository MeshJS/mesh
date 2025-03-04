import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { SupportedEvaluators } from ".";

export default function EvaluatorEvaluateTransaction({
  provider,
  providerName,
}: {
  provider?: SupportedEvaluators;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="evaluateTx"
      title="Evaluate Transaction"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `const unsignedTx = await tx.build();\n`;
  code1 += `const evaluateTx = await provider.evaluateTx(unsignedTx);\n`;

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
