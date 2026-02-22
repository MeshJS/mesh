import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaOfflineEvaluator } from "~/data/links-providers";
import ProviderEvaluators from "./evaluators";

const ReactPage: NextPage = () => {
  const sidebarItems = [{ label: "Evaluate Transaction", to: "evaluateTx" }];

  let code1 = `import { OfflineEvaluator } from "@meshsdk/core-csl";\n\n`;
  code1 += `import { OfflineFetcher } from "@meshsdk/core";\n\n`;
  code1 += `// Create fetcher for resolving UTXOs\n`;
  code1 += `const fetcher = new OfflineFetcher();\n\n`;
  code1 += `// Add UTXOs required for script evaluation\n`;
  code1 += `fetcher.addUTxOs([\n`;
  code1 += `  {\n`;
  code1 += `    input: { \n`;
  code1 += `      txHash: "5de23a2...", \n`;
  code1 += `      outputIndex: 0 \n`;
  code1 += `    },\n`;
  code1 += `    output: {\n`;
  code1 += `      address: "addr1...",\n`;
  code1 += `      amount: [{ unit: "lovelace", quantity: "1000000" }],\n`;
  code1 += `      scriptHash: "32b7e3d..." // For script UTXOs\n`;
  code1 += `    }\n`;
  code1 += `  }\n`;
  code1 += `]);\n\n`;
  code1 += `// Create evaluator for the desired network\n`;
  code1 += `const evaluator = new OfflineEvaluator(fetcher, "preprod");\n`;

  let code2 = `// Evaluate Plutus scripts in a transaction\n`;
  code2 += `try {\n`;
  code2 += `  const actions = await evaluator.evaluateTx(transactionCbor);\n`;
  code2 += `  // Example result:\n`;
  code2 += `  // [{\n`;
  code2 += `  //   index: 0,\n`;
  code2 += `  //   tag: "MINT",\n`;
  code2 += `  //   budget: {\n`;
  code2 += `  //     mem: 508703,    // Memory units used\n`;
  code2 += `  //     steps: 164980381 // CPU steps used\n`;
  code2 += `  //   }\n`;
  code2 += `  // }]\n`;
  code2 += `} catch (error) {\n`;
  code2 += `  console.error('Script evaluation failed:', error);\n`;
  code2 += `}\n`;

  let code3 = `// In your test file\n`;
  code3 += `describe("Plutus Script Tests", () => {\n`;
  code3 += `  let evaluator: OfflineEvaluator;\n`;
  code3 += `  let fetcher: OfflineFetcher;\n\n`;
  code3 += `  beforeEach(() => {\n`;
  code3 += `    fetcher = new OfflineFetcher();\n`;
  code3 += `    evaluator = new OfflineEvaluator(fetcher, "preprod");\n\n`;
  code3 += `    // Add test UTXOs\n`;
  code3 += `    fetcher.addUTxOs([...]);\n`;
  code3 += `  });\n\n`;
  code3 += `  it("should evaluate minting policy", async () => {\n`;
  code3 += `    const result = await evaluator.evaluateTx(txCbor);\n`;
  code3 += `    expect(result[0].tag).toBe("MINT");\n`;
  code3 += `    expect(result[0].budget.mem).toBeLessThan(600000);\n`;
  code3 += `  });\n`;
  code3 += `});\n`;

  return (
    <>
      <Metatags
        title={metaOfflineEvaluator.title}
        description={metaOfflineEvaluator.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaOfflineEvaluator.title}
          description={metaOfflineEvaluator.desc}
        >
          <p>
            The OfflineEvaluator calculates execution costs (memory and CPU
            steps) for Plutus scripts in transactions without requiring network
            connectivity. It works with an{" "}
            <Link href="/providers/offline-fetcher">OfflineFetcher</Link> to
            resolve the UTXOs needed for script validation. This is also
            compatible with any other fetchers to provide online data fetching.
          </p>

          <p>Get started:</p>

          <Codeblock data={code1} />

          <p>
            Once initialized, you can evaluate Plutus scripts in transactions:
          </p>
          <Codeblock data={code2} />

          <p>
            The evaluator is particularly useful for testing Plutus scripts,
            ensuring they execute within memory and CPU limits:
          </p>
          <Codeblock data={code3} />

          <p>
            The evaluation results include memory units and CPU steps required
            for each script execution, helping you optimize your scripts and
            ensure they meet protocol constraints.
          </p>
        </TitleIconDescriptionBody>

        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/OfflineEvaluator" />

        <ProviderEvaluators providerName="offline" />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
