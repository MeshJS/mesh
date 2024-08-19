import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataValue } from "~/data/links-data";
import ValueAccessor from "./accessor";
import ValueComparator from "./comparator";
import ValueConvertor from "./convertor";
import ValueOperator from "./operators";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Value - Convertor", to: "ValueConvertor" },
    { label: "Value - Operator", to: "ValueOperator" },
    { label: "Value - Accessor", to: "ValueAccessor" },
    { label: "Value - Comparator", to: "ValueComparator" },
  ];

  return (
    <>
      <Metatags title={metaDataValue.title} description={metaDataValue.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaDataValue.title}
          description={metaDataValue.desc}
          heroicon={metaDataValue.icon}
        >
          <p>
            Mesh provides a full set of value methods to help accessing,
            comparing, converting, and operating Cardano data.
          </p>
          <h3>Value Types Support</h3>
          <h4>Convertor</h4>
          <ul>
            <li>
              <code>value</code>
            </li>
            <li>
              <code>mValue</code>
            </li>
            <li>
              <code>fromAssets</code>
            </li>
            <li>
              <code>toAssets</code>
            </li>
            <li>
              <code>fromValue</code>
            </li>
            <li>
              <code>toData</code>
            </li>
            <li>
              <code>toJSON</code>
            </li>
          </ul>
          <h4>Operators</h4>
          <ul>
            <li>
              <code>addAsset</code>
            </li>
            <li>
              <code>addAssets</code>
            </li>
            <li>
              <code>negateAsset</code>
            </li>
            <li>
              <code>negateAssets</code>
            </li>
            <li>
              <code>merge</code>
            </li>
          </ul>
          <h4>Accessor</h4>
          <ul>
            <li>
              <code>get</code>
            </li>
            <li>
              <code>units</code>
            </li>
          </ul>
          <h4>Comparator</h4>
          <ul>
            <li>
              <code>geq</code>
            </li>
            <li>
              <code>geqUnit</code>
            </li>
            <li>
              <code>leq</code>
            </li>
            <li>
              <code>leqUnit</code>
            </li>
            <li>
              <code>isEmpty</code>
            </li>
          </ul>
        </TitleIconDescriptionBody>

        <ValueConvertor />
        <ValueOperator />
        <ValueAccessor />
        <ValueComparator />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;

export const mockPolicyId =
  "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c";
export const mockAssetName = "000643b04d65736820676f6f64";
export const mockUnit = mockPolicyId + mockAssetName;
