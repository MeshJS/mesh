import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaSvelteGettingstarted } from "~/data/links-svelte";
import SvelteConnectWallet from "../ui-components/connect-wallet";
import SvelteInstall from "./install";

const SveltePage: NextPage = () => {
  const sidebarItems = [
    { label: "Install", to: "SvelteInstall" },
    { label: "Connect Wallet", to: "connectWallet" },
  ];

  return (
    <>
      <Metatags
        title={metaSvelteGettingstarted.title}
        description={metaSvelteGettingstarted.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSvelteGettingstarted.title}
          description={metaSvelteGettingstarted.desc}
          heroicon={metaSvelteGettingstarted.icon}
        >
          <p>
            Mesh provide a collection of useful UI components, so you can easily
            include web3 functionality and convenient utilities for your
            application.
          </p>
        </TitleIconDescriptionBody>

        <SvelteInstall />
        <SvelteConnectWallet />
      </SidebarFullwidth>
    </>
  );
};

export default SveltePage;
