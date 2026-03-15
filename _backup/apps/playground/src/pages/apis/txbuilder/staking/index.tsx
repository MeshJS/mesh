import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderStaking } from "~/data/links-txbuilders";
import { Intro } from "../common";
import StakingDelegate from "./delegate-stake";
import StakingDeregister from "./deregister-stake";
import StakingRegister from "./register-stake";
import StakingScriptWithdrawal from "./script-withdrawal";
import StakingWithdraw from "./withdraw-stake";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Register Stake", to: "registerStake" },
    { label: "Delegate Stake", to: "delegateStake" },
    { label: "Withdraw Rewards", to: "withdrawRewards" },
    { label: "Deregister Stake", to: "deregisterStake" },
    { label: "Script Withdrawal", to: "scriptWithdrawal" },
  ];

  return (
    <>
      <Metatags
        title={metaTxbuilderStaking.title}
        description={metaTxbuilderStaking.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderStaking.title}
          description={metaTxbuilderStaking.desc}
          heroicon={metaTxbuilderStaking.icon}
        >
          <>
            <Intro />
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder" />

        <StakingRegister />
        <StakingDelegate />
        <StakingWithdraw />
        <StakingDeregister />
        <StakingScriptWithdrawal />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
