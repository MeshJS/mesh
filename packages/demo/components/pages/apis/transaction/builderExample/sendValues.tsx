import Section from '../../../../common/section';
import Codeblock from '../../../../ui/codeblock';

export default function SendValues() {
  return (
    <Section
      sidebarTo="sendValues"
      header="Build a simple transaction to send values"
      contentFn={Content()}
    />
  );
}

function Content() {
  let codeSnippet = ``;
  codeSnippet += `const recipient = 'addr_test1qz8j439j54afpl4hw978xcw8qsa0dsmyd6wm9v8xzeyz7ucrj5rt3et7z59mvmmpxnejvn2scwmseezdq5h5fpw08z8s8d93my';\n`;
  codeSnippet += `const policyIdHex = 'baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700';\n`;
  codeSnippet += `const tokenNameHex = '6d65736874657374696e672e616461';\n`;
  codeSnippet += `const walletAddress = 'addr_test1vpw22xesfv0hnkfw4k5vtrz386tfgkxu6f7wfadug7prl7s6gt89x';\n`;
  codeSnippet += `const privateKey = '5820xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';\n`;
  codeSnippet += `\n`;
  codeSnippet += `const signedTx = await mesh\n`;
  codeSnippet += `  .txIn('572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33', 0)\n`;
  codeSnippet += `  .txIn('572bca237e440b596f4f71374b4b610a995095c6b62a6dcc8549089b93ba0e33', 3)\n`;
  codeSnippet += `  .txOut(recipient, [\n`;
  codeSnippet += `    { unit: 'lovelace', quantity: '2000000' },\n`;
  codeSnippet += `    { unit: policyIdHex + tokenNameHex, quantity: '1' },\n`;
  codeSnippet += `  ])\n`;
  codeSnippet += `  .changeAddress(walletAddress)\n`;
  codeSnippet += `  .txInCollateral('3fbdf2b0b4213855dd9b87f7c94a50cf352ba6edfdded85ecb22cf9ceb75f814', 6)\n`;
  codeSnippet += `  .signingKey(privateKey)\n`;
  codeSnippet += `  .complete();\n`;

  return (
    <>
      <p>
        The following shows a simple example of building a transaction to send
        values to a recipient:
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}
