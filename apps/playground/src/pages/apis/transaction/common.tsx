import Codeblock from "~/components/text/codeblock";

export function Intro() {
  let example = ``;
  example += `import { Transaction } from '@meshsdk/core';\n\n`;
  example += `const tx = new Transaction({ initiator: wallet, fetcher: provider, verbose: true });\n`;
  example += `tx.foo(...); // add transaction methods\n`;
  example += `tx.bar(...); // add transaction methods\n\n`;
  example += `const unsignedTx = await tx.build();\n`;
  example += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  example += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        To initiate a transaction, we import the <code>Transaction</code> class
        from the <code>@meshsdk/core</code> package and assign the wallet to the{" "}
        <code>initiator</code> property. We build the transaction with{" "}
        <code>.build()</code> constructs the transaction and returns a
        transaction CBOR. Behind the scenes, it selects all of the necessary
        inputs belonging to the wallet, calculates the fee for this transaction
        and returns the remaining assets to the change address. Use{" "}
        <code>wallet.signTx()</code> to sign transaction CBOR.
      </p>
      <p>
        The <code>verbose</code> is optional and set to <code>false</code> by
        default, setting it to <code>true</code> will enable verbose logging for
        the txBodyJson prior going into build.
      </p>
      <Codeblock data={example} />
    </>
  );
}

export default function Placeholder() {}
