import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function DataAssetsToPlutusValue() {
  return (
    <TwoColumnsScroll
      sidebarTo="DataAssetsToPlutusValue"
      title="Assets to Plutus Value"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Converting a list of assets to Plutus Value.</p>
      <p>
        <code>value()</code> converts a list of assets into a Plutus Value. The
        function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>assets (Asset[])</b> - the list of assets to be converted
        </li>
      </ul>
      <p>
        The list of assets will be converted into a Plutus Value. The Plutus
        Value can be used in transactions building.
      </p>
    </>
  );
}

// function Right() {
//   return (
//     <>
//       <ADAValue />
//       <TokenValue />
//       <MultipleValue />
//     </>
//   );
// }

// function ADAValue() {
//   async function runDemo() {
//     const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
//     const plutusValue: Value = value(val);
//     return plutusValue;
//   }

//   let code = `import { Asset, parsePlutusValueToAssets, value, Value } from "@meshsdk/core";\n\n`;
//   code += `const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];\n\n`;
//   code += `const plutusValue: Value = value(val);\n`;

//   return (
//     <LiveCodeDemo
//       title="Lovelace Value"
//       subtitle="Convert lovelace to Plutus Value"
//       code={code}
//       runCodeFunction={runDemo}
//     />
//   );
// }

// function TokenValue() {
//   async function runDemo() {
//     const val: Asset[] = [
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//     ];
//     const plutusValue: Value = value(val);
//     return plutusValue;
//   }

//   let code = `import { Asset, parsePlutusValueToAssets, value, Value } from "@meshsdk/core";\n\n`;

//   code += `const val: Asset[] = [\n`;
//   code += `  {\n`;
//   code += `    unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",\n`;
//   code += `    quantity: "345",\n`;
//   code += `  },\n`;
//   code += `];\n\n`;

//   code += `const plutusValue: Value = value(val);\n`;

//   return (
//     <LiveCodeDemo
//       title="Token Value"
//       subtitle="Convert native token to Plutus Value"
//       code={code}
//       runCodeFunction={runDemo}
//     />
//   );
// }

// function MultipleValue() {
//   async function runDemo() {
//     const val: Asset[] = [
//       { unit: "lovelace", quantity: "1000000" },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
//         quantity: "567",
//       },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//     ];
//     const plutusValue: Value = value(val);
//     return plutusValue;
//   }

//   let code = `import { Asset, parsePlutusValueToAssets, value, Value } from "@meshsdk/core";\n\n`;

//   code += `const val: Asset[] = [\n`;
//   code += `  { unit: "lovelace", quantity: "1000000" },\n`;
//   code += `  {\n`;
//   code += `    unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",\n`;
//   code += `    quantity: "567",\n`;
//   code += `  },\n`;
//   code += `  {\n`;
//   code += `    unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",\n`;
//   code += `    quantity: "345",\n`;
//   code += `  },\n`;
//   code += `];\n\n`;

//   code += `const plutusValue: Value = value(val);\n`;

//   return (
//     <LiveCodeDemo
//       title="Multiple Values"
//       subtitle="Convert multiple assets to Plutus Value"
//       code={code}
//       runCodeFunction={runDemo}
//     />
//   );
// }
