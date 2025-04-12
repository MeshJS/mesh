import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaSerializers } from "~/data/links-utilities";
import SerializeAddressObj from "./serialize-address-obj";
import SerializeNativeScript from "./serialize-native-script";
import SerializePlutusScript from "./serialize-plutus-script";
import SerializePoolId from "./serialize-poolid";
import SerializeRewardAddress from "./serialize-reward-address";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Serialize Native Script", to: "serializeNativeScript" },
    { label: "Serialize Plutus Script", to: "serializePlutusScript" },
    { label: "Serialize Address Object", to: "serializeAddressObj" },
    { label: "Serialize Pool ID", to: "serializePoolId" },
    { label: "Serialize Reward Address", to: "serializeRewardAddress" },
  ];

  return (
    <>
      <Metatags
        title={metaSerializers.title}
        description={metaSerializers.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSerializers.title}
          description={metaSerializers.desc}
          heroicon={metaSerializers.icon}
        >
          <>
            <p>
              In smart contract manipulations, serialization is a crucial process that encode
              data structures or objects into a format that can be easily stored or transmitted and later reconstructed. 
              Below are utilities to help serialize various Cardano smart contracts components.
            </p>
          </>
        </TitleIconDescriptionBody>

        <SerializeNativeScript />
        <SerializePlutusScript />
        <SerializeAddressObj />
        <SerializePoolId />
        <SerializeRewardAddress />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
