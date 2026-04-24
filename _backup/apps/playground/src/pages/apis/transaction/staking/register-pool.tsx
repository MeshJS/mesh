import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function StakingRegisterPool() {
  return (
    <TwoColumnsScroll
      sidebarTo="registerPool"
      title="Register Stake Pool"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.registerPool(params: PoolParams)`;

  let code3 = ``;
  code3 += `PoolParams = {\n`;
  code3 += `  vrfKeyHash: string;\n`;
  code3 += `  operator: string;\n`;
  code3 += `  pledge: string;\n`;
  code3 += `  cost: string;\n`;
  code3 += `  margin: [number, number];\n`;
  code3 += `  relays: Relay[];\n`;
  code3 += `  owners: string[];\n`;
  code3 += `  rewardAddress: string;\n`;
  code3 += `  metadata?: PoolMetadata;\n`;
  code3 += `}\n`;

  return (
    <>
      <p>Register a stake pool with the following parameters:</p>
      <Codeblock data={code3} />

      <p>
        You can chain with <code>registerPool()</code> to register a stake pool.
      </p>
      <Codeblock data={codeSnippet} />
    </>
  );
}
