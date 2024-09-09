import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaResolvers } from "~/data/links-utilities";
import ResolveDataHash from "./resolve-data-hash";
import ResolveEpochNumber from "./resolve-epoch-number";
import ResolveFingerprint from "./resolve-fingerprint";
import ResolveNativeScriptAddress from "./resolve-native-script-address";
import ResolveNativeScriptHash from "./resolve-native-script-hash";
import ResolvePaymentKeyHash from "./resolve-payment-key-hash";
import ResolvePlutusScriptAddress from "./resolve-plutus-script-address";
import ResolvePlutusScriptHash from "./resolve-plutus-script-hash";
import ResolvePrivateKey from "./resolve-private-key";
import ResolveScriptHash from "./resolve-script-hash";
import ResolveSlotNumber from "./resolve-slot-number";
import ResolveRewardAddress from "./resolve-stake-address";
import ResolveRewardHash from "./resolve-stake-hash";
import ResolveTxHash from "./resolve-tx-hash";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Data Hash", to: "resolveDataHash" },
    { label: "Fingerprint", to: "resolveFingerprint" },
    { label: "Native Script Address", to: "resolveNativeScriptAddress" },
    { label: "Native Script Hash", to: "resolveNativeScriptHash" },
    { label: "Payment Key Hash", to: "resolvePaymentKeyHash" },
    { label: "Plutus Script Address", to: "resolvePlutusScriptAddress" },
    { label: "Plutus Script Hash", to: "resolvePlutusScriptHash" },
    { label: "Private Key", to: "resolvePrivateKey" },
    { label: "Script Hash", to: "resolveScriptHash" },
    { label: "Stake Address", to: "resolveRewardAddress" },
    { label: "Stake Key Hash", to: "resolveRewardHash" },
    { label: "Transaction Hash", to: "resolveTxHash" },
    { label: "Epoch Number", to: "resolveEpochNumber" },
    { label: "Slot Number", to: "resolveSlotNumber" },
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

        <ResolveDataHash />
        <ResolveFingerprint />
        <ResolveNativeScriptAddress />
        <ResolveNativeScriptHash />
        <ResolvePaymentKeyHash />
        <ResolvePlutusScriptAddress />
        <ResolvePlutusScriptHash />
        <ResolvePrivateKey />
        <ResolveScriptHash />
        <ResolveRewardAddress />
        <ResolveRewardHash />
        <ResolveTxHash />
        <ResolveEpochNumber />
        <ResolveSlotNumber />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
