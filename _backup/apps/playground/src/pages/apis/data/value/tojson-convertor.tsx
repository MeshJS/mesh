import { Asset, integer, MeshValue } from "@meshsdk/common";
import { assocMap, currencySymbol, tokenName } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function TojsonConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="TojsonConvertor"
      title="Convertor - converts the MeshValue object into a JSON representation of Cardano data Value"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        <code>toJSON</code> Converts the MeshValue object into a JSON
        representation of Cardano data Value
      </p>
    </>
  );
}

function Right() {
  async function runtoJSONDemo() {
    const assets: Asset[] = [
      { unit: "lovelace", quantity: "1000000" },
      {
        unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
        quantity: "500",
      },
    ];

    const expectedValue = assocMap([
      [currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])],
      [
        currencySymbol(
          "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c",
        ),
        assocMap([[tokenName("000643b04d65736820676f6f64"), integer(500)]]),
      ],
    ]);

    const meshValue = new MeshValue();
    meshValue.toAssets = () => assets;

    const jsonValue = meshValue.toJSON();
    if (JSON.stringify(jsonValue) === JSON.stringify(expectedValue)) {
      return true;
    }
  }

  let code = `
  import { MeshValue } from "@meshsdk/common";
  const assets: Asset[] = [
  { unit: "lovelace", quantity: "1000000" },
  {
    unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
    quantity: "500",
  },
  ];

  const expectedValue = assocMap([
    [currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])],
    [
      currencySymbol(
        "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c",
      ),
      assocMap([[tokenName("000643b04d65736820676f6f64"), integer(500)]]),
    ],
  ]);

  const meshValue = new MeshValue();
  meshValue.toAssets = () => assets;

  const jsonValue = meshValue.toJSON();
  if (JSON.stringify(jsonValue) === JSON.stringify(expectedValue)) {
    return true;
  }
  `;

  return (
    <>
      <LiveCodeDemo
        title="toJSON"
        subtitle="Converts the MeshValue object into a JSON representation of Cardano data Value"
        code={code}
        runCodeFunction={runtoJSONDemo}
      />
    </>
  );
}
