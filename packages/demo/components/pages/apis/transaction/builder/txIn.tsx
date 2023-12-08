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
  let code = `mesh
  .txIn(txHash: string, txIndex: number, amount?: Asset[], address?: string)`;

  return (
    <>
      <p>
        <code>txIn()</code> is used to set the input for a transaction.{' '}
        <code>amount</code> and <code>address</code> are optional flags which can be used if you
        have supplied the <code>fetcher</code> instance (which enables blockchain
        indexing)
      </p>

      <Codeblock data={code} isJson={false} />
    </>
  );
}
