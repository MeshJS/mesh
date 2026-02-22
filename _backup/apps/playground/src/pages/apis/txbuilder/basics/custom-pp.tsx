import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function TxbuilderCustomPP() {
  return (
    <TwoColumnsScroll
      sidebarTo="customProtocolParameter"
      title="Custom Protocol Parameter"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `const pp = await provider.fetchProtocolParameters();\n`;
  code1 += `\n`;
  code1 += `const txBuilder = new MeshTxBuilder({\n`;
  code1 += `  fetcher: provider,\n`;
  code1 += `  params: pp,\n`;
  code1 += `});\n`;

  return (
    <>
      <p>
        Custom protocol parameters can be fetched from the provider and passed
        to the transaction builder. This is useful when the provider does not
        provide the protocol parameters, or when the user wants to use a custom
        set of parameters.
      </p>
      <Codeblock data={code1} />
    </>
  );
}
