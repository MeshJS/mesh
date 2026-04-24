import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataJson } from "~/data/links-data";
import OtherUtils from "./other-utils";
import UtilsBool from "./utils-bool";
import UtilsByteString from "./utils-bytestring";
import UtilsConstructor from "./utils-constructor";
import UtilsInteger from "./utils-integer";
import UtilsList from "./utils-list";
import UtilsMap from "./utils-map";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Utils - Constructors", to: "UtilsConstructor" },
    { label: "Utils - Integer", to: "UtilsInteger" },
    { label: "Utils - ByteString", to: "UtilsByteString" },
    { label: "Utils - Bool", to: "UtilsBool" },
    { label: "Utils - List", to: "UtilsList" },
    { label: "Utils - Map", to: "UtilsMap" },
    { label: "Other Utils", to: "OtherUtils" },
  ];

  return (
    <>
      <Metatags title={metaDataJson.title} description={metaDataJson.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaDataJson.title}
          description={metaDataJson.desc}
          heroicon={metaDataJson.icon}
        >
          <p>
            Mesh offers a full set of utility functions to help constructing the
            JSON data you need for your Web3 app, with the naming philosophy
            similar to Mesh <code>Data</code> type, with extra utilities
            mimicing the data type names in <b>PlutusTx</b> and <b>Aiken</b>.
          </p>
          <h3>Types Support</h3>
          <p>
            All the utilities are designed to return a type with the same naming
            as the utilities function, with capitalizing first letter, you can
            build your data in JSON with robust type supports, some examples:
          </p>
          <ul>
            <li>
              <code>constr</code> returns <code>Constr</code> type
            </li>
            <li>
              <code>integer</code> returns <code>Integer</code> type
            </li>
            <li>
              <code>byteString</code> returns <code>ByteString</code> type
            </li>
          </ul>
        </TitleIconDescriptionBody>

        <UtilsConstructor />
        <UtilsInteger />
        <UtilsByteString />
        <UtilsBool />
        <UtilsList />
        <UtilsMap />
        <OtherUtils />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
