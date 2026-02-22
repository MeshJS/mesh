import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaReactWallethooks } from "~/data/links-react";
import ReactHookUseAddress from "./use-address";
import ReactHookUseAssets from "./use-assets";
import ReactHookUseLovelace from "./use-lovelace";
import ReactHookuseNetwork from "./use-network";
import ReactHookUseWallet from "./use-wallet";
import ReactHookUseWalletList from "./use-wallet-list";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "useWallet", to: "useWallet" },
    { label: "useWalletList", to: "useWalletList" },
    { label: "useAddress", to: "useAddress" },
    { label: "useAssets", to: "useAssets" },
    { label: "useLovelace", to: "useLovelace" },
    { label: "useNetwork", to: "useNetwork" },
  ];

  return (
    <>
      <Metatags
        title={metaReactWallethooks.title}
        description={metaReactWallethooks.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaReactWallethooks.title}
          description={metaReactWallethooks.desc}
          heroicon={metaReactWallethooks.icon}
        >
          <p>
            React Hooks allow function components to have access to state and
            other React features. With Mesh Hooks, you can easily interact and
            access wallet data.
          </p>
        </TitleIconDescriptionBody>

        <ReactHookUseWallet />
        <ReactHookUseWalletList />
        <ReactHookUseAddress />
        <ReactHookUseAssets />
        <ReactHookUseLovelace />
        <ReactHookuseNetwork />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
