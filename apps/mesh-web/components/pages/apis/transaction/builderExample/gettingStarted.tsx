import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function GettingStarted() {
  return (
    <Section
      sidebarTo="gettingStarted"
      header="Getting started"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeSnippet = ``;
  codeSnippet += `const maestro = new MaestroProvider({\n`;
  codeSnippet += `  network: 'Preprod',\n`;
  codeSnippet += `  apiKey: MAESTRO_API_KEY,\n`;
  codeSnippet += `});\n`;
  codeSnippet += `const mesh = new MeshTxBuilder({\n`;
  codeSnippet += `  fetcher: maestro,\n`;
  codeSnippet += `  submitter: maestro,\n`;
  codeSnippet += `  evaluator: maestro,\n`;
  codeSnippet += `});\n`;

  return (
    <>
      <p>
        To start building an customized transaction, you need to first
        initialize <code>MeshTxBuilder</code> with <code>MaestroProvider</code>:
      </p>

      <Codeblock data={codeSnippet} isJson={false} />

      <p>
        There are 4 optional fields to pass in to initialized the lower level
        APIs instance:
      </p>

      <p>
        1. <code>fetcher</code>: When you build the transaction without
        sufficient fields as required by the serialization library, we would
        index the blockchain to fill the information for you. Affected APIs are
        <code>txIn</code>,<code>txInCollateral</code>,
        <code>spendingTxInReference</code>.
      </p>

      <p>
        2. <code>submitter</code>: It is used if you would like to use the{' '}
        <code>fetcher</code>submitTx API directly from the instance.
      </p>

      <p>
        3. <code>evaluator</code>: It would perform redeemer execution unit
        optimization.
      </p>

      <p>
        4. <code>isHydra</code>: Use another set of default protocol parameters
        for building transactions
      </p>
      <p>
        {`Below provides some examples of transaction building. Complete working
        examples can be found in `}
        <a href="https://github.com/sidan-lab/mesh-lower-level-api-demo">
          mesh-lower-level-api-demo
        </a>
      </p>
    </>
  );
}
