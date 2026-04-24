import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataMesh } from "~/data/links-data";
import OtherUtils from "./other-utils";
import UtilsConstructor from "./utils-constructor";
import UtilsPrimitives from "./utils-primitives";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Utils - Constructors", to: "UtilsConstructor" },
    { label: "Utils - Primitives", to: "UtilsPrimitives" },
    { label: "Other Utils", to: "OtherUtils" },
  ];

  return (
    <>
      <Metatags title={metaDataMesh.title} description={metaDataMesh.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaDataMesh.title}
          description={metaDataMesh.desc}
          heroicon={metaDataMesh.icon}
        >
          <p>
            Mesh provides a full set of utility functions to help constructing
            the Mesh <code>Data</code>
            type you need for your Web3 app.
          </p>
          <h3>Types Support</h3>
          <p>
            All utility functions start with the prefix of <b>m</b> and all
            types All the utility functions start with the prefix of <b>m</b>,
            and are designed to return a type with the same naming as the
            utilities function, with capitalizing first letter, you can build
            your data with type supports in complex types, some examples:
          </p>
          <ul>
            <li>
              <code>mConstr</code> returns <code>MConstr</code> type
            </li>
            <li>
              <code>mBool</code> returns <code>MBool</code> type
            </li>
          </ul>
        </TitleIconDescriptionBody>

        <UtilsConstructor />
        <UtilsPrimitives />
        <OtherUtils />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
