import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaStaking } from "~/data/links-transactions";
import { Intro } from "../common";
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
      <Metatags title={metaStaking.title} description={metaStaking.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaStaking.title}
          description={metaStaking.desc}
          heroicon={metaStaking.icon}
        >
          <p>
            Staking is the process of participating in the network by
            delegating, registering, or withdrawing stake. Staking allows users
            to earn rewards by participating in the network.
          </p>
          <Intro />
          <p>
            In this page, you will find the APIs to create transactions for the
            staking process.
          </p>
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
