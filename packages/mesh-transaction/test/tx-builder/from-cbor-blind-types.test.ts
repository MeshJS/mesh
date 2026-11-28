import { join } from "node:path";
import ts from "typescript";

// The types of fromCbor with blind, asked of TypeScript's language service over the package's
// sources, as an application's code is checked: `{ blind: true }` gives a BlindTx, anything else
// a BuiltTx, and a BlindTx goes where a BuiltTx or its JSON goes in no call.

const PACKAGE = join(__dirname, "..", "..");

/** The probe file, held in memory: it uses the builder as an application does */
const PROBE = join(__dirname, "blind-probe.ts");

// Each line of the probe that is asked for its errors ends with a comment naming it
const PROBE_TEXT = `import type { BlindTx, BuiltTx, TxBuilder } from "../../src";
declare const builder: TxBuilder;
declare const tx: string;
declare const unseen: BlindTx;
export const blind: Promise<BlindTx> = builder.fromCbor(tx, { blind: true }); // blind
export const built: Promise<BuiltTx> = builder.fromCbor(tx); // built
export const read: Promise<BuiltTx> = builder.fromCbor(tx, { blind: false, knownUtxos: [] }); // read
export const notBuilt: Promise<BuiltTx> = builder.fromCbor(tx, { blind: true }); // not built
void builder.fromCbor(tx, { blind: true, knownUtxos: [] }); // both
void builder.build([], { after: unseen }); // after
void builder.build([], { after: [unseen] }); // after list
void builder.restore(unseen); // restore
void builder.plan({ step: unseen }); // step
void unseen.sign({}); // no signers
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

describe("the types of fromCbor with blind", () => {
  let service: ts.LanguageService;
  beforeAll(() => {
    service = languageService();
  });

  /** The errors on the line of the probe named `name` */
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
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  };

  it.each(["blind", "built", "read"])(
    "types the line %s: { blind: true } gives a BlindTx, no blind or blind: false a BuiltTx",
    (name) => {
      expect(errorsOn(name)).toEqual([]);
    },
    60_000,
  );

  it.each([
    "not built",
    "both",
    "after",
    "after list",
    "restore",
    "step",
    "no signers",
  ])(
    "refuses the line %s: a BlindTx is no BuiltTx, blind takes no knownUtxos, and sign needs signers",
    (name) => {
      expect(errorsOn(name)).not.toEqual([]);
    },
    60_000,
  );
});
