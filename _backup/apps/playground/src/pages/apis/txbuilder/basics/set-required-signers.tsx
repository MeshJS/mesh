import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderSetRequiredSigners() {
  return (
    <TwoColumnsScroll
      sidebarTo="requiredSigners"
      title="Set Required Signers"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `txBuilder\n`;
  code += `  .requiredSignerHash(pubKeyHash)\n`;

  return (
    <>
      <p>
        Sets the required signers for the transaction. This is useful when you
        want to include multiple signers, such as in a multi-signature
        transaction or smart contracts.
      </p>
      <Codeblock data={code} />
    </>
  );
}
