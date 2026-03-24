import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TransactionSetTime() {
  return (
    <TwoColumnsScroll
      sidebarTo="setTime"
      title="Set Start and Expire Time"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = `import { resolveSlotNo } from '@meshsdk/core';\n`;
  code1 += `let minutes = 5; // add 5 minutes\n`;
  code1 += `let nowDateTime = new Date();\n`;
  code1 += `let dateTimeAdd5Min = new Date(nowDateTime.getTime() + minutes*60000);\n`;
  code1 += `const slot = resolveSlotNo('mainnet', dateTimeAdd5Min.getTime());\n`;

  let codeExpire = `const tx = new Transaction({ initiator: wallet });\n`;
  codeExpire += `// do tx.sendLovelace() or any transactions actions\n`;
  codeExpire += `tx.setTimeToExpire(slot)\n`;
  codeExpire += `const unsignedTx = await tx.build();\n`;

  let codeValid = `const tx = new Transaction({ initiator: wallet });\n`;
  codeValid += `// do tx.sendLovelace() or any transactions actions\n`;
  codeValid += `tx.setTimeToStart(slot)\n`;
  codeValid += `const unsignedTx = await tx.build();\n`;

  return (
    <>
      <p>
        We can define the time-to-live (TTL) for the transaction. TTL is the
        time limit for our transaction to be included in a blockchain, if it is
        not in a blockchain by then the transaction will be cancelled. This time
        limit is defined as <code>slot</code>.
      </p>
      <p>
        In order to get the <code>slot</code> of the time you wish the
        transaction would expire, you can use <code>resolveSlotNo</code>. For
        example, if you would like the transaction to expire in 5 minutes, you
        can get the <code>slot</code> in the following way:
      </p>
      <Codeblock data={code1} />
      <p>
        Next, we set the TTL with <code>setTimeToExpire</code> and providing the{" "}
        <code>slot</code>, this means that if the transaction is submitted after
        after <code>slot</code> will not be valid.
      </p>
      <Codeblock data={codeExpire} />
      <p>
        Likewise, we can set a "validity start interval" for the transaction,
        where it is the time the transaction will be valid. We can define the
        start time with <code>setTimeToStart</code> and providing the{" "}
        <code>slot</code>:
      </p>
      <Codeblock data={codeValid} />
      <p>
        Note that, if you are using a policy locking script, you must define{" "}
        <code>setTimeToExpire</code> before the expiry; otherwise, you will
        catch the <code>ScriptWitnessNotValidatingUTXOW</code> error.
      </p>
    </>
  );
}
