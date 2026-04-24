import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function DataPlutusValueToAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="DataPlutusValueToAssets"
      title="Plutus Value to Assets"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Converting a Plutus Value into a list of assets.</p>
      <p>
        <code>parsePlutusValueToAssets()</code> converts a Plutus Value into a
        list of assets. The function accepts the following parameters:
      </p>
      <ul>
        <li>
          <b>value (Value)</b> - the Plutus Value to be converted
        </li>
      </ul>
      <p>The Plutus Value will be converted into a list of assets.</p>
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
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);
//     return assets;
//   }

//   let code = `import { Asset, parsePlutusValueToAssets, value, Value } from "@meshsdk/core";\n\n`;
//   code += `const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];\n\n`;
//   code += `const plutusValue: Value = value(val);\n`;
//   code += `parsePlutusValueToAssets(plutusValue);\n`;

//   return (
//     <LiveCodeDemo
//       title="Lovelace Value"
//       subtitle="Convert lovelace Plutus Value into assets"
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
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);
//     return assets;
//   }

//   let code = `import { Asset, parsePlutusValueToAssets, value, Value } from "@meshsdk/core";\n\n`;

//   code += `const val: Asset[] = [\n`;
//   code += `  {\n`;
//   code += `    unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",\n`;
//   code += `    quantity: "345",\n`;
//   code += `  },\n`;
//   code += `];\n\n`;

//   code += `const plutusValue: Value = value(val);\n`;
//   code += `parsePlutusValueToAssets(plutusValue);\n`;

//   return (
//     <LiveCodeDemo
//       title="Token Value"
//       subtitle="Convert native token Plutus Value into assets"
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
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);
//     return assets;
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
//   code += `parsePlutusValueToAssets(plutusValue);\n`;

//   return (
//     <LiveCodeDemo
//       title="Multiple Values"
//       subtitle="Convert assets in Plutus Value into assets"
//       code={code}
//       runCodeFunction={runDemo}
//     />
//   );
// }
