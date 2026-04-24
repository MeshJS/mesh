import { HydraProvider } from "@meshsdk/hydra";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraNewTx({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="newTx"
      title="New Transaction"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = ``;
  code += `async newTx(\n`;
  code += `  cborHex: string,\n`;
  code += `  type:\n`;
  code += `    | "Tx ConwayEra"\n`;
  code += `    | "Unwitnessed Tx ConwayEra"\n`;
  code += `    | "Witnessed Tx ConwayEra",\n`;
  code += `  description = "",\n`;
  code += `  txId?: string\n`;
  code += `)\n`;

  let code2 = ``;
  code2 += `async function makeTx() {\n`;
  code2 += `  const walletA = {\n`;
  code2 += `    addr: "addr_test1vpsthwvxgfkkm2lm8ggy0c5345u6vrfctmug6tdyx4rf4mqn2xcyw",\n`;
  code2 += `    key: "58201aae63d93899640e91b51c5e8bd542262df3ecf3246c3854f39c40f4eb83557d",\n`;
  code2 += `  };\n`;
  code2 += `\n`;
  code2 += `  const wallet = new MeshWallet({\n`;
  code2 += `    networkId: 0,\n`;
  code2 += `    key: {\n`;
  code2 += `      type: "cli",\n`;
  code2 += `      payment: walletA.key,\n`;
  code2 += `    },\n`;
  code2 += `    fetcher: provider,\n`;
  code2 += `    submitter: provider,\n`;
  code2 += `  });\n`;
  code2 += `\n`;
  code2 += `  const pp = await provider.fetchProtocolParameters();\n`;
  code2 += `  const utxos = await wallet.getUtxos("enterprise");\n`;
  code2 += `  const changeAddress = walletA.addr;\n`;
  code2 += `\n`;
  code2 += `  const txBuilder = new MeshTxBuilder({\n`;
  code2 += `    fetcher: provider,\n`;
  code2 += `    params: pp,\n`;
  code2 += `    verbose: true,\n`;
  code2 += `  });\n`;
  code2 += `\n`;
  code2 += `  const unsignedTx = await txBuilder\n`;
  code2 += `    .txOut(\n`;
  code2 += `      "addr_test1vpd5axpq4qsh8sxvzny49cp22gc5tqx0djf6wmjv5cx7q5qyrzuw8",\n`;
  code2 += `      [{ unit: "lovelace", quantity: "3000000" }],\n`;
  code2 += `    )\n`;
  code2 += `    .changeAddress(changeAddress)\n`;
  code2 += `    .selectUtxosFrom(utxos)\n`;
  code2 += `    .complete();\n`;
  code2 += `\n`;
  code2 += `  const signedTx = await wallet.signTx(unsignedTx);\n`;
  code2 += `  const txHash = await wallet.submitTx(signedTx);\n`;
  code2 += `  console.log("txHash", txHash);\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        Submit a transaction through the head. Note that the transaction is only
        broadcast if well-formed and valid.
      </p>
      <p>
        You can also the <code>await provider.submitTx(signedTx)</code> method
        to submit a signed transaction.
      </p>
      <p>
        The <code>newTx</code> method accepts the following arguments:
      </p>
      <Codeblock data={code} />

      <p>
        Here is an example of how to create a transaction using the Hydra
        provider, Mesh wallet and Mesh transaction builder:
      </p>
      <Codeblock data={code2} />
    </>
  );
}
