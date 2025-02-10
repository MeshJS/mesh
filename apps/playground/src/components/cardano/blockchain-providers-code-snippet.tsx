import { useState } from "react";

import ButtonGroup from "../button/button-group";
import Codeblock from "../text/codeblock";

export default function BlockchainProviderCodeSnippet() {
  const [blockchainProvider, setBlockchainProvider] = useState("blockfrost");

  let codeBF = `import { BlockfrostProvider } from '@meshsdk/core';\n\n`;
  codeBF += `const blockchainProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');`;

  let codeKoios = `import { KoiosProvider } from '@meshsdk/core';\n\n`;
  codeKoios += `const blockchainProvider = new KoiosProvider('<api|preview|preprod|guild>', '<token>');`;

  let codeTango = `import { TangoProvider } from '@meshsdk/core';\n\n`;
  codeTango += `const blockchainProvider = new TangoProvider(\n`;
  codeTango += `  '<mainnet,testnet>',\n`;
  codeTango += `  '<TANGOCRYPTO_APP_ID>'\n`;
  codeTango += `  '<TANGOCRYPTO_API_KEY>'\n`;
  codeTango += `);`;

  let codeMaestro = `import { MaestroProvider } from '@meshsdk/core';\n\n`;
  codeMaestro += `const blockchainProvider = new MaestroProvider({\n`;
  codeMaestro += `  network: 'Preprod',\n`;
  codeMaestro += `  apiKey: '<Your-API-Key>', // Get yours by visiting https://docs.gomaestro.org/docs/Getting-started/Sign-up-login.\n`;
  codeMaestro += `  turboSubmit: false // Read about paid turbo transaction submission feature at https://docs.gomaestro.org/docs/Dapp%20Platform/Turbo%20Transaction.\n`;
  codeMaestro += `});\n`;

  let codeU5c = `import { U5CProvider } from "@meshsdk/core";\n\n`;
  codeU5c += `const blockchainProvider = new U5CProvider({\n`;
  codeU5c += `  url: "http://localhost:5005U5c",\n`;
  codeU5c += `  headers: {\n`;
  codeU5c += `    "dmtr-api-key": "<api-key>",\n`;
  codeU5c += `  },\n`;
  codeU5c += `});\n`;

  let code = codeBF;
  if (blockchainProvider == "koios") {
    code = codeKoios;
  }
  if (blockchainProvider == "tango") {
    code = codeTango;
  }
  if (blockchainProvider == "maestro") {
    code = codeMaestro;
  }
  if (blockchainProvider == "utxorpc") {
    code = codeU5c;
  }

  return (
    <>
      <ButtonGroup
        items={[
          {
            key: "maestro",
            label: "Maestro",
            onClick: () => setBlockchainProvider("maestro"),
          },
          {
            key: "blockfrost",
            label: "Blockfrost",
            onClick: () => setBlockchainProvider("blockfrost"),
          },
          {
            key: "koios",
            label: "Koios",
            onClick: () => setBlockchainProvider("koios"),
          },
          {
            key: "utxorpc",
            label: "UTxORPC",
            onClick: () => setBlockchainProvider("utxorpc"),
          },
        ]}
        currentSelected={blockchainProvider}
      />
      <Codeblock data={code} />
    </>
  );
}
