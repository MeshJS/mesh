import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaResolvers } from "~/data/links-utilities";
import ResolveDataHash from "./resolve-data-hash";
import ResolveEpochNumber from "./resolve-epoch-number";
import ResolveFingerprint from "./resolve-fingerprint";
import ResolveNativeScriptHash from "./resolve-native-script-hash";
import ResolvePrivateKey from "./resolve-private-key";
import ResolveScriptHash from "./resolve-script-hash";
import ResolveScriptHashDRepId from "./resolve-script-hash-rep-id";
import ResolveSlotNumber from "./resolve-slot-number";
import ResolveRewardAddress from "./resolve-stake-address";
import ResolveRewardHash from "./resolve-stake-hash";
import ResolveTxHash from "./resolve-tx-hash";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Private Key", to: "resolvePrivateKey" },
    { label: "Transaction Hash", to: "resolveTxHash" },
    { label: "Data Hash", to: "resolveDataHash" },
    { label: "Native Script Hash", to: "resolveNativeScriptHash" },
    { label: "Script Hash", to: "resolveScriptHash" },
    { label: "Fingerprint", to: "resolveFingerprint" },
    { label: "Stake Address", to: "resolveRewardAddress" },
    { label: "Stake Key Hash", to: "resolveRewardHash" },
    { label: "Script Hash Rep Id", to: "resolveScriptHashDRepId" },
    { label: "Epoch Number", to: "resolveEpochNumber" },
    { label: "Slot Number", to: "resolveSlotNumber" },
    
    // ------------------- Deprecated zone ---------------------

    // { label: "Native Script Address", to: "resolveNativeScriptAddress" },
    // { label: "Payment Key Hash", to: "resolvePaymentKeyHash" },
    // { label: "Plutus Script Address", to: "resolvePlutusScriptAddress" },
    // { label: "Plutus Script Hash", to: "resolvePlutusScriptHash" },
  ];

  return (
    <>
      <Metatags title={metaResolvers.title} description={metaResolvers.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaResolvers.title}
          description={metaResolvers.desc}
          heroicon={metaResolvers.icon}
        >
          <></>
        </TitleIconDescriptionBody>

        <ResolvePrivateKey />
        <ResolveTxHash />
        <ResolveDataHash />
        <ResolveNativeScriptHash />
        <ResolveScriptHash />
        <ResolveRewardAddress />
        <ResolveFingerprint />
        <ResolveRewardHash />
        <ResolveScriptHashDRepId />
        <ResolveEpochNumber />
        <ResolveSlotNumber />
        
        {/* ------------------- Deprecated zone ---------------------*/}
        {/* <ResolveNativeScriptAddress /> */}
        {/* <ResolvePaymentKeyHash /> */}
        {/* <ResolvePlutusScriptAddress /> */}
        {/* <ResolvePlutusScriptHash /> */}

      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
