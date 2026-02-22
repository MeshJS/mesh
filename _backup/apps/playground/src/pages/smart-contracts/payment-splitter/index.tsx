import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaPaymentSplitter } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import PaymentSplitterSendLovelace from "./send-lovelace";
import PaymentSplitterTriggerPayout from "./trigger-payout";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    {
      label: "Send Lovelace to Payment Splitter",
      to: "sendLovelaceToSplitter",
    },
    { label: "Trigger Payout", to: "triggerPayout" },
  ];

  let example = ``;

  example += `import { MeshPaymentSplitterContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshPaymentSplitterContract(\n`;
  example += `  {\n`;
  example += `    mesh: meshTxBuilder,\n`;
  example += `    fetcher: provider,\n`;
  example += `    wallet: wallet,\n`;
  example += `    networkId: 0,\n`;
  example += `  },\n`;
  example += `  [\n`;
  example += `    'addr_test1vpg334d6skwu6xxq0r4lqrnsjd5293n8s3d80em60kf6guc7afx8k',\n`;
  example += `    'addr_test1vp4l2kk0encl7t7972ngepgm0044fu8695prkgh5vjj5l6sxu0l3p',\n`;
  example += `    'addr_test1vqqnfs2vt42nq4htq460wd6gjxaj05jg9vzg76ur6ws4sngs55pwr',\n`;
  example += `    'addr_test1vqv2qhqddxmf87pzky2nkd9wm4y5599mhp62mu4atuss5dgdja5pw',\n`;
  example += `  ]\n`;
  example += `);\n`;

  return (
    <>
      <Metatags
        title={metaPaymentSplitter.title}
        description={metaPaymentSplitter.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaPaymentSplitter.title}
          description={metaPaymentSplitter.desc}
          heroicon={metaPaymentSplitter.icon}
        >
          <>
            <p>
              A payment splitter can be used for example to create a shared
              project donation address, ensuring that all payees receive the
              same amount
            </p>
            <p>
              Sending lovelace to the contract works similarly to sending
              lovelace to any other address. The payout transaction can only be
              submitted by one of the payees, and the output addresses are
              restricted to the payees. The output sum must be equally divided
              to ensure the transaction is successful.
            </p>

            <p>
              There are 2 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>Send Lovelace to Payment Splitter</li>
              <li>Trigger Payout</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the payment splitter, we need to initialize a{" "}
              <Link href="/providers">provider</Link>, a{" "}
              <code>MeshTxBuilder</code>, and a{" "}
              <code>MeshPaymentSplitterContract</code>. Additionally, a list of
              payees is required to define the allowed payout addresses for the
              contract.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/payment-splitter">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshPaymentSplitterContract" />

        <PaymentSplitterSendLovelace />
        <PaymentSplitterTriggerPayout />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
