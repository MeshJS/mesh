import { useState } from "react";

import ButtonGroup from "../button/button-group";
import Codeblock from "../text/codeblock";

export default function ProviderCodeSnippet() {
  const [provider, setprovider] = useState("blockfrost");

  let codeBF = `import { BlockfrostProvider } from '@meshsdk/core';\n\n`;
  codeBF += `const provider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');`;

  let codeKoios = `import { KoiosProvider } from '@meshsdk/core';\n\n`;
  codeKoios += `const provider = new KoiosProvider('<api|preview|preprod|guild>', '<token>');`;

  let codeMaestro = `import { MaestroProvider } from '@meshsdk/core';\n\n`;
  codeMaestro += `const provider = new MaestroProvider({\n`;
  codeMaestro += `  network: 'Preprod',\n`;
  codeMaestro += `  apiKey: '<Your-API-Key>', // Get yours by visiting https://docs.gomaestro.org/docs/Getting-started/Sign-up-login.\n`;
  codeMaestro += `  turboSubmit: false // Read about paid turbo transaction submission feature at https://docs.gomaestro.org/docs/Dapp%20Platform/Turbo%20Transaction.\n`;
  codeMaestro += `});\n`;

  let codeU5c = `import { U5CProvider } from "@meshsdk/core";\n\n`;
  codeU5c += `const provider = new U5CProvider({\n`;
  codeU5c += `  url: "http://localhost:5005U5c",\n`;
  codeU5c += `  headers: {\n`;
  codeU5c += `    "dmtr-api-key": "<api-key>",\n`;
  codeU5c += `  },\n`;
  codeU5c += `});\n`;

  let code = codeBF;
  if (provider == "koios") {
    code = codeKoios;
  }
  if (provider == "maestro") {
    code = codeMaestro;
  }
  if (provider == "utxorpc") {
    code = codeU5c;
  }

  return (
    <>
      <ButtonGroup
        items={[
          {
            key: "maestro",
            label: "Maestro",
            onClick: () => setprovider("maestro"),
          },
          {
            key: "blockfrost",
            label: "Blockfrost",
            onClick: () => setprovider("blockfrost"),
          },
          {
            key: "koios",
            label: "Koios",
            onClick: () => setprovider("koios"),
          },
          {
            key: "utxorpc",
            label: "UTxORPC",
            onClick: () => setprovider("utxorpc"),
          },
        ]}
        currentSelected={provider}
      />
      <Codeblock data={code} />
    </>
  );
}
