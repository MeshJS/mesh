import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaSvelteUicomponents } from "~/data/links-svelte";
import SvelteConnectWallet from "./connect-wallet";

const SveltePage: NextPage = () => {
  const sidebarItems = [{ label: "Connect Wallet", to: "connectWallet" }];

  return (
    <>
      <Metatags
        title={metaSvelteUicomponents.title}
        description={metaSvelteUicomponents.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSvelteUicomponents.title}
          description={metaSvelteUicomponents.desc}
          heroicon={metaSvelteUicomponents.icon}
        >
          <p>
            Mesh provide a collection of useful UI components, so you can easily
            include web3 functionality and convenient utilities for your
            application.
          </p>
        </TitleIconDescriptionBody>

        <SvelteConnectWallet />
      </SidebarFullwidth>
    </>
  );
};

export default SveltePage;
