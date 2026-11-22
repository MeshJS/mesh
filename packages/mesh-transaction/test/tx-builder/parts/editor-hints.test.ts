import { join } from "node:path";
import ts from "typescript";

// What an editor shows while a part is written, asked of TypeScript's language service over the
// package's sources: the names it suggests inside a literal, the signatures it offers, and where
// an error stands and what it says. Neither jest nor the build asks this: jest only transpiles
// the tests, and the build types the sources alone.

const PACKAGE = join(__dirname, "..", "..", "..");

/** The probe file, held in memory: it imports the parts as an application does */
const PROBE = join(__dirname, "editor-probe.ts");

// Each line of the probe that is asked for its errors ends with a comment naming it
const PROBE_TEXT = `import type { SpendPart, TxBuilder } from "../../../src";
import {
  certificate,
  collateral,
  guard,
  mint,
  output,
  proposal,
  referenceInput,
  spend,
  withdrawal,
} from "../../../src";
declare const address: string;
declare const stake: string;
declare const hash: string;
declare const anyUtxo: any;
declare const builder: TxBuilder;
output({ address, value: {  } });
certificate.voteDelegation({ stake, drep: "" });
spend.pubKey({ utxo: { txHash: hash, outputIdx: 0 } }); // spend typo
referenceInput({ utxo: { txHash: hash, outputIdx: 0 } }); // reference typo
collateral({ utxo: { txHash: hash, outputIdx: 0 } }); // collateral typo
export const fromAny: SpendPart = spend.pubKey({ utxo: anyUtxo }); // any
void builder.build(spend.pubKey({ utxo: { step: "a", output: 0 } })); // link
spend.plutus();
referenceInput();
collateral();
spend.mint(); // spend name
mint.nope(); // mint name
withdrawal.nope(); // withdrawal name
certificate.stakeDelegate(); // certificate name
proposal.nope(); // proposal name
guard.nope(); // guard name
`;

/** The package's compiler options, as its tsconfig gives them */
const compilerOptions = (): ts.CompilerOptions => {
  const configPath = join(PACKAGE, "tsconfig.json");
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    PACKAGE,
    undefined,
    configPath,
  );
  return { ...options, noEmit: true, types: [] };
};

/** A language service over the package and the probe file */
const languageService = (): ts.LanguageService => {
  const options = compilerOptions();
  const read = (file: string) =>
    file === PROBE ? PROBE_TEXT : ts.sys.readFile(file);
  return ts.createLanguageService(
    {
      getScriptFileNames: () => [PROBE],
      getScriptVersion: () => "1",
      getScriptSnapshot: (file) => {
        const text = read(file);
        return text === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => PACKAGE,
      getCompilationSettings: () => options,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: (file) => file === PROBE || ts.sys.fileExists(file),
      readFile: read,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    },
    ts.createDocumentRegistry(),
  );
};

/** The position right after the one place `text` stands in the probe */
const after = (text: string): number => {
  const at = PROBE_TEXT.indexOf(text);
  if (at < 0 || PROBE_TEXT.indexOf(text, at + 1) >= 0)
    throw new Error(`the probe has not one ${text}`);
  return at + text.length;
};

describe("the parts in an editor", () => {
  let service: ts.LanguageService;
  beforeAll(() => {
    service = languageService();
  });

  /** The errors on the line of the probe named `name`, each with the text it stands on */
  const errorsOn = (name: string) => {
    const line = PROBE_TEXT.split("\n").findIndex((text) =>
      text.endsWith(`// ${name}`),
    );
    if (line < 0) throw new Error(`the probe has no line ${name}`);
    return service
      .getSemanticDiagnostics(PROBE)
      .filter(
        (error) =>
          ts.getLineAndCharacterOfPosition(error.file!, error.start!).line ===
          line,
      )
      .map((error) => ({
        at: PROBE_TEXT.slice(error.start, error.start! + error.length!),
        text: ts.flattenDiagnosticMessageText(error.messageText, "\n"),
      }));
  };

  /** The names suggested with the cursor at `position` */
  const suggested = (position: number): string[] =>
    (service.getCompletionsAtPosition(PROBE, position, {})?.entries ?? []).map(
      (entry) => entry.name,
    );

  it("suggests lovelace in a value given as a record", () => {
    expect(suggested(after("value: { "))).toContain("lovelace");
  }, 60_000);

  it("suggests the two words a vote may be delegated to", () => {
    expect(suggested(after('drep: "'))).toEqual(
      expect.arrayContaining(["alwaysAbstain", "alwaysNoConfidence"]),
    );
  }, 60_000);

  it.each(["spend", "reference", "collateral"])(
    "reports a misspelt field of a UTxO (%s) on the field, in one line",
    (name) => {
      expect(errorsOn(`${name} typo`)).toEqual([
        {
          at: "outputIdx",
          text: expect.stringMatching(
            /^[^\n]*'outputIdx' does not exist[^\n]*$/,
          ),
        },
      ]);
    },
    60_000,
  );

  it("makes a spend of a UTxO typed any a plain part", () => {
    expect(errorsOn("any")).toEqual([]);
  }, 60_000);

  it("refuses a part linked to an earlier step in a build", () => {
    expect(errorsOn("link")).not.toEqual([]);
  }, 60_000);

  it.each(["spend.plutus(", "referenceInput(", "collateral("])(
    "offers one signature for %s",
    (call) => {
      const help = service.getSignatureHelpItems(
        PROBE,
        after(`\n${call});`) - 2,
        {},
      );
      expect(help?.items).toHaveLength(1);
    },
    60_000,
  );

  it.each([
    ["spend", "Property 'mint' does not exist on type 'SpendBuilders'."],
    ["mint", "Property 'nope' does not exist on type 'MintBuilders'."],
    [
      "withdrawal",
      "Property 'nope' does not exist on type 'WithdrawalBuilders'.",
    ],
    [
      "certificate",
      "Property 'stakeDelegate' does not exist on type 'CertificateBuilders'. Did you mean 'stakeDelegation'?",
    ],
    ["proposal", "Property 'nope' does not exist on type 'ProposalBuilders'."],
    ["guard", "Property 'nope' does not exist on type 'GuardBuilders'."],
  ])(
    "names the type of %s for a part it does not have",
    (name, text) => {
      expect(errorsOn(`${name} name`).map((error) => error.text)).toEqual([
        text,
      ]);
    },
    60_000,
  );
});
