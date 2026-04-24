import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaOverview } from "~/data/links-data";
import CBORPlutusData from "./cbor-plutus-data";
import JSONPlutusData from "./json-plutus-data";
import MeshPlutusData from "./mesh-plutus-data";
import PlutusDataIntro from "./plutus-data-intro";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Introduction", to: "PlutusDataIntro" },
    { label: "Mesh Types", to: "MeshPlutusData" },
    { label: "JSON Types", to: "JSONPlutusData" },
    { label: "CBOR", to: "CBORPlutusData" },
  ];

  return (
    <>
      <Metatags title={metaOverview.title} description={metaOverview.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaOverview.title}
          description={metaOverview.desc}
          heroicon={metaOverview.icon}
        >
          <p>
            Parsing and converting data in Plutus is a common task when working
            with transactions. This page will show you how to do that.
          </p>
        </TitleIconDescriptionBody>
        <PlutusDataIntro />
        <MeshPlutusData />
        <JSONPlutusData />
        <CBORPlutusData />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
