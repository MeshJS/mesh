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
        Specify an output to the transaction. This funcion allows you to design
        the outputs UTXOs, by splitting the outputs in multiple UTXOs or
        designing reference inputs.
      </p>
      <Codeblock
        data={`tx.sendValue(address: Recipient, value: UTxO);`}
        isJson={false}
      />
      <p></p>
      <Codeblock data={codeSnippet} isJson={false} />
      <p>
        Where <code>UTxO</code> has the following format:
      </p>
      <Codeblock data={codeUtxo} isJson={false} />
    </>
  );
}

function Right({}) {
  return <></>;
}
