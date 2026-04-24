import { HydraProvider } from "@meshsdk/hydra";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraDecommit({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="decommit"
      title="Decommit"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `async decommit(\n`;
  code += `  cborHex: string,\n`;
  code += `  type:\n`;
  code += `    | "Tx ConwayEra"\n`;
  code += `    | "Unwitnessed Tx ConwayEra"\n`;
  code += `    | "Witnessed Tx ConwayEra",\n`;
  code += `  description = "",\n`;
  code += `)\n`;
  return (
    <>
      <p>
        Request to decommit a UTxO from a Head by providing a decommit tx. Upon
        reaching consensus, this will eventually result in corresponding
        transaction outputs becoming available on the layer 1.
      </p>
      <p>
        The <code>decommit</code> method accepts the following arguments:
      </p>
      <Codeblock data={code} />
    </>
  );
}
