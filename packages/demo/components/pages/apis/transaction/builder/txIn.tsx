import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TxIn() {
  return (
    <Section
      sidebarTo="txIn"
      header="Set pubkey input for transaction"
      contentFn={Content()}
    />
  );
}

function Content() {
  let code = `mesh.txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  return (
    <>
      <p>
        Use <code>txIn()</code> to set the input for transaction.{' '}
        <code>amount</code> and <code>address</code> are optional flags if you
        have the <code>fetcher</code> instance supplied, where blockchain
        indexing would be performed on
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
