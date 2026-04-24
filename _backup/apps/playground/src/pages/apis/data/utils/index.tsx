import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataUtils } from "~/data/links-data";
// import DataAssetsToPlutusValue from "./assets-to-plutus-value";
import DataPlutusPlutusArrayString from "./plutus-array-to-string";
// import DataPlutusValueToAssets from "./plutus-value-to-assets";
import DataPlutusStringPlutusArray from "./string-to-plutus-array";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "String to Plutus Array", to: "DataPlutusStringPlutusArray" },
    { label: "Plutus Array to String", to: "DataPlutusPlutusArrayString" },
    { label: "Assets to Plutus Value", to: "DataAssetsToPlutusValue" },
    { label: "Plutus Value to Assets", to: "DataPlutusValueToAssets" },
  ];

  return (
    <>
      <Metatags title={metaDataUtils.title} description={metaDataUtils.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaDataUtils.title}
          description={metaDataUtils.desc}
          heroicon={metaDataUtils.icon}
        >
          <p>
            Mesh offers a full set of utility functions to help constructing the
            JSON data you need for your Web3 app, with the naming philosophy
            similar to Mesh <code>Data</code> type, with extra utilities
            mimicing the data type names in <b>PlutusTx</b> and <b>Aiken</b>.
            The code example showing below does not cover all utilities, please
            checkout the hosted documentation for more details.
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

        <DataPlutusStringPlutusArray />
        <DataPlutusPlutusArrayString />
        {/* <DataAssetsToPlutusValue />
        <DataPlutusValueToAssets /> */}
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
