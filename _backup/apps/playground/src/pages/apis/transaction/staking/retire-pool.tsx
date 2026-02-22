import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function StakingRetirePool() {
  return (
    <TwoColumnsScroll
      sidebarTo="retirePool"
      title="Retire Stake Pool"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.retirePool(poolId: string, epochNo: number)`;

  return (
    <>
      <p>
        To retire a stake pool, you need to provide the <code>poolId</code> and
        the <code>epochNo</code> when the pool will be retired.
      </p>
      <Codeblock data={codeSnippet} />
    </>
  );
}
