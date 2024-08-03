import { Data, resolveDataHash } from "@meshsdk/core";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ContractDesigningDatum() {
  return (
    <TwoColumnsScroll
      sidebarTo="datum"
      title="Designing Datum"
      leftSection={Left()}
    />
  );
}

function Left() {
  // string
  const datumString: Data = "meshtoken";
  const datumStringHash = resolveDataHash(datumString);
  let codeSnippetdatumString = `const datumString: Data = 'meshtoken';\n`;
  codeSnippetdatumString += `const datumStringHash = resolveDataHash(datumString);\n`;
  codeSnippetdatumString += `// datahash: ${datumStringHash}`;

  // number
  const datumNumber: Data = 12345678;
  const datumNumberHash = resolveDataHash(datumNumber);
  let codeSnippetdatumNumber = `const datumNumber: Data = 12345678;\n`;
  codeSnippetdatumNumber += `const datumNumberHash = resolveDataHash(datumNumber);\n`;
  codeSnippetdatumNumber += `// datahash: ${datumNumberHash}`;

  // array
  const datumList: Data = ["meshtoken", 12345678];
  const datumListHash = resolveDataHash(datumList);
  let codeSnippetdatumList = `const datumList: Data = [12345678, 'meshtoken'];\n`;
  codeSnippetdatumList += `const datumListHash = resolveDataHash(datumList);\n`;
  codeSnippetdatumList += `// datahash: ${datumListHash}\n\n`;

  // array of arrays
  const datumList2: Data = [
    ["meshtoken", 12345678],
    [
      ["super", "secret", "datum"],
      ["addr_123", 5],
    ],
  ];
  const datumList2Hash = resolveDataHash(datumList2);
  codeSnippetdatumList += `const datumList2: Data = [\n`;
  codeSnippetdatumList += `  ['meshtoken', 12345678],\n`;
  codeSnippetdatumList += `  [\n`;
  codeSnippetdatumList += `    ['super', 'secret', 'datum'],\n`;
  codeSnippetdatumList += `    ['addr_123', 5],\n`;
  codeSnippetdatumList += `  ],\n`;
  codeSnippetdatumList += `];\n`;
  codeSnippetdatumList += `const datumList2Hash = resolveDataHash(datumList2);\n`;
  codeSnippetdatumList += `// datahash: ${datumList2Hash}`;

  // map
  const datumMap: Data = new Map<Data, Data>();
  datumMap.set("token", "meshtoken");
  datumMap.set("price", "12345678");
  const datumMapHash = resolveDataHash(datumMap);
  let codeSnippetdatumMap = `const datumMap: Data = new Map<Data, Data>();\n`;
  codeSnippetdatumMap += `datumMap.set('token', 'meshtoken');\n`;
  codeSnippetdatumMap += `datumMap.set('price', '12345678');\n`;
  codeSnippetdatumMap += `const datumMapHash = resolveDataHash(datumMap);\n`;
  codeSnippetdatumMap += `// datahash: ${datumMapHash}\n\n`;

  const datumMap2: Data = new Map<Data, Data>();
  datumMap2.set([1, 2], ["meshtoken", 123]);
  datumMap2.set([3, 4], 12345678);
  const datumMap2Hash = resolveDataHash(datumMap2);
  codeSnippetdatumMap += `const datumMap2: Data = new Map<Data, Data>();\n`;
  codeSnippetdatumMap += `datumMap2.set([1, 2], ['meshtoken', 123]);\n`;
  codeSnippetdatumMap += `datumMap2.set([3, 4], 12345678);\n`;
  codeSnippetdatumMap += `const datumMap2Hash = resolveDataHash(datumMap2);\n`;
  codeSnippetdatumMap += `// datahash: ${datumMap2Hash}`;

  // constructor
  const datumConstructor: Data = {
    alternative: 0,
    fields: ["meshtoken", 12345678],
  };
  const datumConstructorHash = resolveDataHash(datumConstructor);

  let codeSnippetdatumConstructor = `const datumConstructor: Data = {\n`;
  codeSnippetdatumConstructor += `  alternative: 0,\n`;
  codeSnippetdatumConstructor += `  fields: ['meshtoken', 12345678],\n`;
  codeSnippetdatumConstructor += `};\n`;
  codeSnippetdatumConstructor += `const datumConstructorHash = resolveDataHash(datumConstructor);\n`;
  codeSnippetdatumConstructor += `// datahash: ${datumConstructorHash}`;

  return (
    <>
      <p>
        Mesh allows you to freely design the datum structure to suit the plutus
        smart contract requirements. You can import the <code>Data</code> type
        to help you design the datum.
      </p>
      <Codeblock
        data={`import { resolveDataHash } from '@meshsdk/core';\nimport type { Data } from '@meshsdk/core';`}
        isJson={false}
      />

      <h3>A string</h3>
      <p>A datum as simple as just a string, preferably a hex string.</p>
      <Codeblock data={codeSnippetdatumString} />
      <h3>A number</h3>
      <p>It can also be a number.</p>
      <Codeblock data={codeSnippetdatumNumber} />
      <h3>An array</h3>
      <p>
        Or an array, where each item can be either a string, number, a list, or
        a map.
      </p>
      <Codeblock data={codeSnippetdatumList} />
      <h3>A Map</h3>
      <p>
        It can also be a map, where both the keys and its values can be a
        string, number, a list, or a map.
      </p>
      <Codeblock data={codeSnippetdatumMap} />
      <h3>With constructor</h3>
      <p>
        Or a datum with a constructor, where <code>alternative</code> is a
        number, and <code>fields</code> is an array.
      </p>
      <Codeblock data={codeSnippetdatumConstructor} />
    </>
  );
}
