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
  let code = `mesh
  .txInCollateral(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  return (
    <>
      <p>
        Use <code>.txInCollateral()</code> to set the collateral UTxO for the
        transaction. Similar with <code>.txIn()</code>, you could optionally
        provide the amount and address information of UTxO:
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
