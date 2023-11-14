import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxIn() {
  return (
    <SectionTwoCol
      sidebarTo="txIn"
      header="Set input for transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  let codeAsset = ``;
  codeAsset += `Asset = {\n`;
  codeAsset += `  unit: string;\n`;
  codeAsset += `  quantity: string;\n`;
  codeAsset += `}\n`;

  return (
    <>
      <p>
        Use <code>txIn()</code> to set the input for transaction:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Where <code>Asset</code> is an object with the following properties:
      </p>

      <Codeblock data={codeAsset} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
