import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxParserTestingMints() {
  return (
    <TwoColumnsScroll
      sidebarTo="testingMints"
      title="Testing Mints"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txTester\n`;
  code += `  .tokenMinted(\n`;
  code += `    "eab3a1d125a3bf4cd941a6a0b5d7752af96fae7f5bcc641e8a0b6762",\n`;
  code += `    "",\n`;
  code += `    1,\n`;
  code += `  );\n`;
  return (
    <>
      <p>Testing mints with below APIs:</p>
      <Codeblock data={code} />
      <ol>
        <li>
          <code>tokenMinted</code>: Checks if a specific token is minted in the
          transaction.
        </li>
        <li>
          <code>onlyTokenMinted</code>: Checks if a specific token is minted in
          the transaction and that it is the only mint.
        </li>
        <li>
          <code>policyOnlyMintedToken</code>: Checks if a specific token is
          minted in the transaction, ensuring that it is the only mint for the
          given policy ID.
        </li>
        <li>
          <code>checkPolicyOnlyBurn</code>: Checks if a specific policy ID is
          burned in the transaction, ensuring that it is the only minting (i.e.
          burning item).
        </li>
      </ol>
    </>
  );
}
