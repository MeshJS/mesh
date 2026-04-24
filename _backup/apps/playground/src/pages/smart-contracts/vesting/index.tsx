import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaVesting } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import VestingDepositFund from "./deposit-fund";
import VestingFullTutorial from "./full-tutorial";
import VestingWithdrawFund from "./withdraw-fund";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Deposit Fund", to: "depositFund" },
    { label: "Withdraw Fund", to: "withdrawFund" },
    { label: "Full Tutorial", to: "tutorial" },
  ];

  let example = ``;

  example += `import { MeshVestingContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshVestingContract({\n`;
  example += `  mesh: meshTxBuilder,\n`;
  example += `  fetcher: provider,\n`;
  example += `  wallet: wallet,\n`;
  example += `  networkId: 0,\n`;
  example += `});\n`;

  return (
    <>
      <Metatags title={metaVesting.title} description={metaVesting.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaVesting.title}
          description={metaVesting.desc}
          heroicon={metaVesting.icon}
        >
          <>
            <p>
              When a new employee joins an organization, they typically receive
              a promise of compensation to be disbursed after a specified
              duration of employment. This arrangement often involves the
              organization depositing the funds into a vesting contract, with
              the employee gaining access to the funds upon the completion of a
              predetermined lockup period. Through the utilization of vesting
              contracts, organizations establish a mechanism to encourage
              employee retention by linking financial rewards to tenure.
            </p>
            <p>
              There are 2 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>deposit asset</li>
              <li>withdraw asset</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the contract, we need to initialize a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>MeshTxBuilder</code> and <code>MeshVestingContract</code>.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/vesting">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshVestingContract" />

        <VestingDepositFund />
        <VestingWithdrawFund />
        <VestingFullTutorial />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
