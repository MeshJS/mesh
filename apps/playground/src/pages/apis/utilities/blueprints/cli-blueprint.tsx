import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function CLIBlueprint() {
  return (
    <TwoColumnsScroll
      sidebarTo="cliBlueprint"
      title="CLI Blueprint Generator"
      leftSection={left()}
      rightSection={right()}
    />
  );
}

function left() {
  return (
    <>
      <p>
        The Mesh CLI provides a convenient way to generate TypeScript types and
        classes from Cardano CIP-57 blueprint files. This allows you to
        automatically create type-safe interfaces for your smart contracts.
      </p>
      <p>
        The CLI uses the same parsing engine as the{" "}
        <Link href="https://marketplace.visualstudio.com/items?itemName=sidan-lab.cardano-bar-vscode">
          Cardano Bar VSCode extension
        </Link>{" "}
        to ensure consistent and reliable code generation.
      </p>
    </>
  );
}

function right() {
  const cliUsageCode = `# Generate TypeScript types from a Cardano blueprint
npx meshjs blueprint ./path/to/your-blueprint.json ./src/generated/types.ts

# Example with a real blueprint file
npx meshjs blueprint ./contracts/oneShot.json ./src/types/oneShot.ts`;

  const exampleBlueprintCode = {
    preamble: {
      title: "mesh/one_shot",
      description: "Aiken contracts for project 'mesh/one_shot'",
      version: "0.0.0",
      plutusVersion: "v3",
      compiler: {
        name: "Aiken",
        version: "v1.1.17+c3a7fba",
      },
      license: "Apache-2.0",
    },
    validators: [
      {
        title: "one_shot.one_shot.mint",
        redeemer: {
          title: "redeemer",
          schema: {
            $ref: "#/definitions/one_shot~1MintPolarity",
          },
        },
        parameters: [
          {
            title: "utxo_ref",
            schema: {
              $ref: "#/definitions/cardano~1transaction~1OutputReference",
            },
          },
        ],
        compiledCode:
          "590178010100229800aba2aba1aba0aab9faab9eaab9dab9a488888896600264653001300800198041804800cdc3a400130080024888966002600460106ea800e266446644b300130060018acc004c034dd5004400a2c80722b300130030018acc004c034dd5004400a2c80722c805900b0992cc004c040006264b30013006300c375401115980099198008009bac3011300e375400c44b30010018a508acc004cdd7980918079baa30120010158a518998010011809800a01a4041130030018a50402d13370e0029000a016375a6018601e00316403464b30013002300b375400314bd6f7b63044dd5980798061baa001402864660020026eacc03cc040c040c040c040c030dd5002112cc0040062980103d87a8000899192cc004cdc8803000c56600266e3c018006266e95200033011300f0024bd7045300103d87a80004035133004004301300340346eb8c034004c04000500e18051baa006375c601860126ea800cdc3a400516401c300800130033754011149a26cac8009",
        hash: "476e529a91415c9d54d4a5293c81b21918d23f7695473cba3621b896",
      },
      {
        title: "one_shot.one_shot.else",
        redeemer: {
          schema: {},
        },
        parameters: [
          {
            title: "utxo_ref",
            schema: {
              $ref: "#/definitions/cardano~1transaction~1OutputReference",
            },
          },
        ],
        compiledCode:
          "590178010100229800aba2aba1aba0aab9faab9eaab9dab9a488888896600264653001300800198041804800cdc3a400130080024888966002600460106ea800e266446644b300130060018acc004c034dd5004400a2c80722b300130030018acc004c034dd5004400a2c80722c805900b0992cc004c040006264b30013006300c375401115980099198008009bac3011300e375400c44b30010018a508acc004cdd7980918079baa30120010158a518998010011809800a01a4041130030018a50402d13370e0029000a016375a6018601e00316403464b30013002300b375400314bd6f7b63044dd5980798061baa001402864660020026eacc03cc040c040c040c040c030dd5002112cc0040062980103d87a8000899192cc004cdc8803000c56600266e3c018006266e95200033011300f0024bd7045300103d87a80004035133004004301300340346eb8c034004c04000500e18051baa006375c601860126ea800cdc3a400516401c300800130033754011149a26cac8009",
        hash: "476e529a91415c9d54d4a5293c81b21918d23f7695473cba3621b896",
      },
    ],
    definitions: {
      ByteArray: {
        title: "ByteArray",
        dataType: "bytes",
      },
      Int: {
        dataType: "integer",
      },
      "cardano/transaction/OutputReference": {
        title: "OutputReference",
        description:
          "An `OutputReference` is a unique reference to an output on-chain. The `output_index`\n corresponds to the position in the output list of the transaction (identified by its id)\n that produced that output",
        anyOf: [
          {
            title: "OutputReference",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                title: "transaction_id",
                $ref: "#/definitions/ByteArray",
              },
              {
                title: "output_index",
                $ref: "#/definitions/Int",
              },
            ],
          },
        ],
      },
      "one_shot/MintPolarity": {
        title: "MintPolarity",
        anyOf: [
          {
            title: "RMint",
            dataType: "constructor",
            index: 0,
            fields: [],
          },
          {
            title: "RBurn",
            dataType: "constructor",
            index: 1,
            fields: [],
          },
        ],
      },
    },
  };

  const generatedOutputCode = `// Generated TypeScript types from blueprint
import {
  OutputReference,
  ConStr0,
  ConStr1,
  MintingBlueprint,
} from "@meshsdk/core";

const version = "V3";
const networkId = 0; // 0 for testnet; 1 for mainnet

export class OneShotMintBlueprint extends MintingBlueprint {
  compiledCode: string;

  constructor(params: [OutputReference]) {
    const compiledCode = blueprint.validators[0]!.compiledCode;
    super(version);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [OutputReference]): [OutputReference] => data;
}

export type MintPolarity = RMint | RBurn;

export type RMint = ConStr0<[]>;

export type RBurn = ConStr1<[]>;`;

  return (
    <>
      <h3 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
        Usage
      </h3>
      <p className="mb-4 text-gray-500 dark:text-gray-400">
        Use the following command to generate TypeScript code from your
        blueprint:
      </p>
      <Codeblock data={cliUsageCode} isJson={false} />

      <h3 className="mb-3 mt-8 text-2xl font-bold text-gray-900 dark:text-white">
        Example Blueprint File
      </h3>
      <p className="mb-4 text-gray-500 dark:text-gray-400">
        Here's an example of a CIP-57 blueprint JSON file:
      </p>
      <Codeblock data={exampleBlueprintCode} isJson={true} />

      <h3 className="mb-3 mt-8 text-2xl font-bold text-gray-900 dark:text-white">
        Generated Output
      </h3>
      <p className="mb-4 text-gray-500 dark:text-gray-400">
        The CLI will generate TypeScript code with proper types and blueprint
        classes:
      </p>
      <Codeblock data={generatedOutputCode} isJson={false} />

      <h3 className="mb-3 mt-8 text-2xl font-bold text-gray-900 dark:text-white">
        Features
      </h3>
      <ul className="mb-4 list-inside list-disc space-y-2 text-gray-500 dark:text-gray-400">
        <li>
          <strong>Type Safety:</strong> Generates TypeScript interfaces and
          types based on your blueprint schema
        </li>
        <li>
          <strong>Blueprint Classes:</strong> Automatically creates Mesh
          blueprint classes for spending, minting, and withdrawal validators
        </li>
        <li>
          <strong>Import Management:</strong> Handles all necessary imports from
          the Mesh SDK
        </li>
        <li>
          <strong>CIP-57 Compliant:</strong> Supports the full CIP-57 blueprint
          specification
        </li>
        <li>
          <strong>Easy Integration:</strong> Generated code integrates
          seamlessly with existing Mesh projects
        </li>
      </ul>
    </>
  );
}
