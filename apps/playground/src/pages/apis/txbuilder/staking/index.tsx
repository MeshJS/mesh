import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderStaking } from "~/data/links-txbuilders";
import StakingDelegate from "./delegate-stake";
import StakingDeregister from "./deregister-stake";
import StakingRegister from "./register-stake";
import StakingWithdraw from "./withdraw-stake";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Register Stake", to: "registerStake" },
    { label: "Delegate Stake", to: "delegateStake" },
    { label: "Withdraw Rewards", to: "withdrawRewards" },
    { label: "Deregister Stake", to: "deregisterStake" },
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
          <></>
        </TitleIconDescriptionBody>
        <StakingRegister />
        <StakingDelegate />
        <StakingWithdraw />
        <StakingDeregister />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
