import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataValue } from "~/data/links-data";
import AddAssetOperator from "./addasset-operator";
import AddAssetsOperator from "./addassets-operator";
import FromAssetsConvertor from "./fromassets-convertor";
import FromValueConvertor from "./fromvalue-convertor";
import GeqComparator from "./geq-comparator";
import GeqUnitComparator from "./gequnit-comparator";
import GetAccessor from "./get-accessor";
import IsEmptyComparator from "./isempty-comparator";
import LeqComparator from "./leq-comparator";
import LeqUnitComparator from "./lequnit-comparator";
import MergeOperator from "./merge-operator";
import MValueConvertor from "./mvalue-convertor";
import NegateAssetOperator from "./negateasset-operator";
import NegateAssetsOperator from "./negateassets-operator";
import ToAssetsConvertor from "./toassets-convertor";
import ToDataConvertor from "./todata-convertor";
import ToJsonConvertor from "./tojson-convertor";
import UnitsAccessor from "./units-accessor";
import ValueConvertor from "./value-convertor";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Convertors", to: "ValueConvertor" },
    // { label: "Convertor - mValue", to: "MvalueConvertor" },
    // { label: "Convertor - fromAssets", to: "FromassetsConvertor" },
    // { label: "Convertor - toAssets", to: "ToassetsConvertor" },
    // { label: "Convertor - fromValue", to: "FromvalueConvertor" },
    // { label: "Convertor - toData", to: "TodataConvertor" },
    // { label: "Convertor - toJSON", to: "TojsonConvertor" },
    { label: "Operators", to: "AddAssetOperator" },
    // { label: "Operator - addAssets", to: "AddassetsOperator" },
    // { label: "Operator - negateAsset", to: "NegateassetOperator" },
    // { label: "Operator - negateAssets", to: "NegateassetsOperator" },
    // { label: "Operator - merge", to: "MergeOperator" },
    { label: "Accessors", to: "GetAccessor" },
    // { label: "Accessor - units", to: "UnitsAccessor" },
    { label: "Comparators", to: "GeqComparator" },
    // { label: "Comparator - gepUnit", to: "GequnitComparator" },
    // { label: "Comparator - leq", to: "LeqComparator" },
    // { label: "Comparator - leqUnit", to: "LequnitComparator" },
    // { label: "Comparator - isEmpty", to: "IsemptyComparator" },
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
            We all know the pain of conducting <code>Value</code> operation in
            Cardano. Mesh provides a full set of value methods to help
            converting, operating, accessing and comparing Cardano data.
          </p>
          <h3>Value Types Support</h3>
          <h4>Convertors</h4>
          <p>
            Convertor functions provide utilities around round trip among
            Cardano onchain data and off chain <code>JSON</code> and{" "}
            <code>Data</code> type.
          </p>
          {/* <ul>
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
          </ul> */}
          <h4>Operators</h4>
          <p>
            Operator functions provide utilities into performing value
            manipulation. They are useful in apps which check against value
            payment involving calculation in value.
          </p>

          <h4>Accessor</h4>
          <p>
            Accessor functions provide utilities in obtaining keys or values of
            the <code>Value</code> type.
          </p>

          <h4>Comparator</h4>
          <p>
            Comparator functions provide utilities in comparing different{" "}
            <code>Value</code>. It helps with offchain validation before using
            for transaction building.
          </p>
        </TitleIconDescriptionBody>

        <ValueConvertor />
        <MValueConvertor />
        <FromAssetsConvertor />
        <ToAssetsConvertor />
        <FromValueConvertor />
        <ToDataConvertor />
        <ToJsonConvertor />
        <AddAssetOperator />
        <AddAssetsOperator />
        <NegateAssetOperator />
        <NegateAssetsOperator />
        <MergeOperator />
        <GetAccessor />
        <UnitsAccessor />
        <GeqComparator />
        <GeqUnitComparator />
        <LeqComparator />
        <LeqUnitComparator />
        <IsEmptyComparator />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;

export const mockPolicyId =
  "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c";
export const mockAssetName = "000643b04d65736820676f6f64";
export const mockUnit = mockPolicyId + mockAssetName;
