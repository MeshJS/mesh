import SectionTwoCol from '../../../../common/sectionTwoCol';
import Codeblock from '../../../../ui/codeblock';

export default function TxOut() {
  return (
    <SectionTwoCol
      sidebarTo="txOut"
      header="Set output for transaction"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = `mesh.txOut(address: string, amount: Asset[])`;

  let codeAsset = ``;
  codeAsset += `Asset = {\n`;
  codeAsset += `  unit: string;\n`;
  codeAsset += `  quantity: string;\n`;
  codeAsset += `}\n`;

  return (
    <>
      <p>
        Use <code>txOut()</code> to set the input datum for transaction:
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