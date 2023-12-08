import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function TransactionWithoutDependency() {
  return (
    <Section
      sidebarTo="withoutDependency"
      header="Build a transaction without any dependency"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeSnippet = ``;
  codeSnippet += `const signedTx = mesh\n`;
  codeSnippet += `  .txIn('572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33', 0, [{ unit: 'lovelace', quantity: '2000000' }], myAddress)\n`;
  codeSnippet += `  .txIn('572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33', 3, [{ unit: 'lovelace', quantity: '2000000' }], myAddress)\n`;
  codeSnippet += `  .txOut(recipient, [\n`;
  codeSnippet += `    { unit: 'lovelace', quantity: '2000000' },\n`;
  codeSnippet += `    { unit: policyIdHex + tokenNameHex, quantity: '1' },\n`;
  codeSnippet += `  ])\n`;
  codeSnippet += `  .changeAddress(walletAddress)\n`;
  codeSnippet += `  .txInCollateral('3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814', 6, [{ unit: 'lovelace', quantity: '5000000' }], myAddress)\n`;
  codeSnippet += `  .signingKey(privateKey)\n`;
  codeSnippet += `  .completeSync();\n`;
  codeSnippet += `  .completeSigning();\n`;

  return (
    <>
      <p>
        The following shows a example of building transaction without any
        dependency:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}
