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
  example += `const blockchainProvider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: blockchainProvider,\n`;
  example += `  submitter: blockchainProvider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshPaymentSplitterContract(\n`;
  example += `  {\n`;
  example += `    mesh: meshTxBuilder,\n`;
  example += `    fetcher: blockchainProvider,\n`;
  example += `    wallet: wallet,\n`;
  example += `    networkId: 0,\n`;
  example += `  },\n`;
  example += `  [\n`;
  example += `    'addr_test1qr77kjlsarq8wy22g4flrcznjh5lkug5mvth7qhhkewgmezwvc8hnnjzy82j5twzf8dfy5gjk04yd09t488ys9605dvq4ymc4x',\n`;
  example += `    'addr_test1qp96dhfygf2ejktf6tq9uv3ks67t4w5rkumww2v5rqja0xcx8ls6mu88ytwql66750at9at4apy4jdezhu22artnvlys7ec2gm',\n`;
  example += `    'addr_test1qrnmrpa4jmnefdt9pg0ljmgzewmdtjkxty79nf3av62kuhe6l0r5at03w5jg59l906cvdg358rqrssry2am2hessu42slmqppm',\n`;
  example += `    'addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt',\n`;
  example += `    'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9',\n`;
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
