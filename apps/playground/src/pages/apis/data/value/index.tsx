import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDataValue } from "~/data/links-data";
import AddassetOperator from "./addasset-operator";
import AddassetsOperator from "./addassets-operator";
import FromassetsConvertor from "./fromassets-convertor";
import FromvalueConvertor from "./fromvalue-convertor";
import GeqComparator from "./geq-comparator";
import GequnitComparator from "./gequnit-comparator";
import GetAccessor from "./get-accessor";
import IsemptyComparator from "./isempty-comparator";
import LeqComparator from "./leq-comparator";
import LequnitComparator from "./lequnit-comparator";
import MergeOperator from "./merge-operator";
import MvalueConvertor from "./mvalue-convertor";
import NegateassetOperator from "./negateasset-operator";
import NegateassetsOperator from "./negateassets-operator";
import ToassetsConvertor from "./toassets-convertor";
import TodataConvertor from "./todata-convertor";
import TojsonConvertor from "./tojson-convertor";
import UnitsAccessor from "./units-accessor";
import ValueConvertor from "./value-convertor";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Convertor - value", to: "ValueConvertor" },
    { label: "Convertor - mValue", to: "MvalueConvertor" },
    { label: "Convertor - fromAssets", to: "FromassetsConvertor" },
    { label: "Convertor - toAssets", to: "ToassetsConvertor" },
    { label: "Convertor - fromValue", to: "FromvalueConvertor" },
    { label: "Convertor - toData", to: "TodataConvertor" },
    { label: "Convertor - toJSON", to: "TojsonConvertor" },
    { label: "Operator - addAsset", to: "AddassetOperator" },
    { label: "Operator - addAssets", to: "AddassetsOperator" },
    { label: "Operator - negateAsset", to: "NegateassetOperator" },
    { label: "Operator - negateAssets", to: "NegateassetsOperator" },
    { label: "Operator - merge", to: "MergeOperator" },
    { label: "Accessor - get", to: "GetAccessor" },
    { label: "Accessor - units", to: "UnitsAccessor" },
    { label: "Comparator - gep", to: "GeqComparator" },
    { label: "Comparator - gepUnit", to: "GequnitComparator" },
    { label: "Comparator - leq", to: "LeqComparator" },
    { label: "Comparator - leqUnit", to: "LequnitComparator" },
    { label: "Comparator - isEmpty", to: "IsemptyComparator" },
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
            Mesh provides a full set of value methods to help converting,
            operating, accessing and comparing Cardano data.
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
        <MvalueConvertor />
        <FromassetsConvertor />
        <ToassetsConvertor />
        <FromvalueConvertor />
        <TodataConvertor />
        <TojsonConvertor />
        <AddassetOperator />
        <AddassetsOperator />
        <NegateassetOperator />
        <NegateassetsOperator />
        <MergeOperator />
        <GetAccessor />
        <UnitsAccessor />
        <GeqComparator />
        <GequnitComparator />
        <LeqComparator />
        <LequnitComparator />
        <IsemptyComparator />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;

export const mockPolicyId =
  "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c";
export const mockAssetName = "000643b04d65736820676f6f64";
export const mockUnit = mockPolicyId + mockAssetName;
