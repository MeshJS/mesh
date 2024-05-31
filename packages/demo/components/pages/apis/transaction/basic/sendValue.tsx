import Codeblock from '../../../../ui/codeblock';
import SectionTwoCol from '../../../../common/sectionTwoCol';

export default function SendValue() {
  return (
    <SectionTwoCol
      sidebarTo="sendValue"
      header="Send Value to Addresses"
      leftFn={Left({})}
      rightFn={Right({})}
    />
  );
}

function Left({}) {
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;
  codeSnippet += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippet += `  .sendValue(recipient, UTxO);\n`;
  codeSnippet += `\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let codeUtxo = ``;
  codeUtxo += `{\n`;
  codeUtxo += `  input: {\n`;
  codeUtxo += `      outputIndex: number;\n`;
  codeUtxo += `      txHash: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `  output: {\n`;
  codeUtxo += `      address: string;\n`;
  codeUtxo += `      amount: Asset[];\n`;
  codeUtxo += `      dataHash?: string;\n`;
  codeUtxo += `      plutusData?: string;\n`;
  codeUtxo += `      scriptRef?: string;\n`;
  codeUtxo += `  };\n`;
  codeUtxo += `}\n`;

  return (
    <>
      <p>
        Specify an output for the transaction. This funcion allows you to design
        the output UTXOs, either by splitting the outputs from multiple UTxOs or
        by creating reference inputs.
      </p>
      <Codeblock
        data={`tx.sendValue(address: Recipient, value: UTxO);`}
        isJson={false}
      />
      <p></p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        where <code>UTxO</code> has the following format (use one of our providers):
      </p>
      <Codeblock data={codeUtxo} isJson={false} />
    </>
  );
}

function Right({}) {
  return <></>;
}
