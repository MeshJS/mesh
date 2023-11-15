import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxInCollateral() {
  return (
    <Section
      sidebarTo="txInCollateral"
      header="Set collateral UTxO"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.txInCollateral(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  let codeAsset = ``;
  codeAsset += `Asset = {\n`;
  codeAsset += `  unit: string;\n`;
  codeAsset += `  quantity: string;\n`;
  codeAsset += `}\n`;

  return (
    <>
      <p>
        Use <code>txInCollateral()</code> to set the collateral UTxO for the
        transaction:
      </p>

      <Codeblock data={code} isJson={false} />

      <p>
        Where <code>Asset</code> is an object with the following properties:
      </p>

      <Codeblock data={codeAsset} isJson={false} />
    </>
  );
}
