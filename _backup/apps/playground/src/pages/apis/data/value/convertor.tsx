import {
  Asset,
  byteString,
  dict,
  Dict,
  Integer,
  integer,
  MeshValue,
  MValue,
  mValue,
  Value,
  value,
} from "@meshsdk/common";
import { assocMap, currencySymbol, tokenName } from "@meshsdk/core";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function ValueConvertor() {
  return (
    <TwoColumnsScroll
      sidebarTo="ValueConvertor"
      title="Value Methods for Converting Cardano Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <Section1 />
      <Section2 />
      <Section3 />
      <Section4 />
      <Section5 />
      <Section6 />
      <Section7 />
    </>
  );
}

function Section1() {
  return (
    <>
      <p>
        <code>value</code> converts assets into Cardano data Value in JSON with
        parameters:
      </p>
      <ul>
        <li>
          <b>val</b> - Asset[] to convert
        </li>
      </ul>
    </>
  );
}

function Section2() {
  return (
    <>
      <p>
        <code>mValue</code> converts assets into Cardano data value in Mesh Data
        type with parameters:
      </p>
      <ul>
        <li>
          <b>val</b> - Asset[] to convert
        </li>
      </ul>
    </>
  );
}

function Section3() {
  return (
    <>
      <p>
        <code>fromAssets</code> converts assets into MeshValue with parameters:
      </p>
      <ul>
        <li>
          <b>assets</b> - the assets to convert
        </li>
      </ul>
    </>
  );
}

function Section4() {
  return (
    <>
      <p>
        <code>fromValue</code> get all asset units with no parameters (e.g.
        unit) needed
      </p>
      <ul>
        <li>
          <b>plutusValue</b> - Convert Value (the JSON representation of Cardano
          data Value) into MeshValue
        </li>
      </ul>
    </>
  );
}

function Section5() {
  return (
    <>
      <p>
        <code>toAssets</code> converts the MeshValue object into an array of
        Asset
      </p>
    </>
  );
}

function Section6() {
  return (
    <>
      <p>
        <code>toData</code> Convert the MashValue object into Cardano data Value
        in Mesh Data type
      </p>
    </>
  );
}

function Section7() {
  return (
    <>
      <p>
        <code>toJSON</code> converts the MeshValue object into a JSON
        representation of Cardano data Value
      </p>
    </>
  );
}

function Right() {
  return (
    <>
      <LiveCodeDemo
        title="value"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value. Please check convertor.test.ts for more information."
        code={getCode()}
        runCodeFunction={runvalueDemo}
      />
      <LiveCodeDemo
        title="mValue"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value. Please check convertor.test.ts for more information."
        code={getCode2()}
        runCodeFunction={runmValueDemo}
      />
      <LiveCodeDemo
        title="fromAssets"
        subtitle="Converts assets into MeshValue with parameters - asset[] e.g. ada value, simple token token, complex value. Please check convertor.test.ts for more information."
        code={getCode3()}
        runCodeFunction={runfromAssetsDemo}
      />
      <LiveCodeDemo
        title="toAssets"
        subtitle="Converts the MeshValue object into an array of Asset"
        code={getCode4()}
        runCodeFunction={runtoAssetsDemo}
      />
      <LiveCodeDemo
        title="fromValue"
        subtitle="Convert Value (the JSON representation of Cardano data Value) into MeshValue"
        code={getCode5()}
        runCodeFunction={runfromValueDemo}
      />
      <LiveCodeDemo
        title="toData"
        subtitle="Converts the MeshValue object into Cardano data Value in Mesh Data type"
        code={getCode6()}
        runCodeFunction={runtoDataDemo}
      />
      <LiveCodeDemo
        title="toJSON"
        subtitle="Converts the MeshValue object into a JSON representation of Cardano data Value"
        code={getCode7()}
        runCodeFunction={runtoJSONDemo}
      />
    </>
  );
}

function getCode() {
  return `
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: Value = value(val);
  const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
  const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
    return true;
  }
  `;
}

async function runvalueDemo() {
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: Value = value(val);
  const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
  const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
    return true;
  }
}

function getCode2() {
  return `
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: MValue = mValue(val);
  const nameMap = new Map().set("", 1000000);
  const valMap = new Map().set("", nameMap);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
    return true;
  `;
}

async function runmValueDemo() {
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const datum: MValue = mValue(val);
  const nameMap = new Map().set("", 1000000);
  const valMap = new Map().set("", nameMap);
  if (JSON.stringify(datum) === JSON.stringify(valMap)) {
    return true;
  }
}

function getCode3() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const assets: Asset[] = [
    { unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64", quantity: "100" },
    { unit: "lovelace", quantity: "10" },
  ];
  const value = MeshValue.fromAssets(assets);
  return value;
  `;
}

async function runfromAssetsDemo() {
  const assets: Asset[] = [
    {
      unit: "c21d710605bb00e69f3c175150552fc498316d80e7efdb1b186db38c000643b04d65736820676f6f64",
      quantity: "100",
    },
    { unit: "lovelace", quantity: "10" },
  ];
  const value = MeshValue.fromAssets(assets);
  return value;
}

function getCode4() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const plutusValue: Value = value(val);
  const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
  return assets;
  `;
}

async function runtoAssetsDemo() {
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const plutusValue: Value = value(val);
  const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
  return assets;
}

function getCode5() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const plutusValue: Value = value(val);
  const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
  return assets;
  `;
}

async function runfromValueDemo() {
  const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  const plutusValue: Value = value(val);
  const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
  return assets;
}

function getCode6() {
  return `
  import { MeshValue } from "@meshsdk/common";
  const val: Asset[] = [
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "100",
    },
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "200",
    },
  ];
  const plutusValue: Value = value(val);
  const data = MeshValue.fromValue(plutusValue).toData();
  const expected: MValue = mValue(val);
  if (JSON.stringify(expected) === JSON.stringify(data)) {
    return true;
  }
  `;
}

async function runtoDataDemo() {
  const val: Asset[] = [
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "100",
    },
    {
      unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
      quantity: "200",
    },
  ];
  const plutusValue: Value = value(val);
  const data = MeshValue.fromValue(plutusValue).toData();
  const expected: MValue = mValue(val);
  if (JSON.stringify(expected) === JSON.stringify(data)) {
    return true;
  }
}

function getCode7() {
  return `
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
}

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
