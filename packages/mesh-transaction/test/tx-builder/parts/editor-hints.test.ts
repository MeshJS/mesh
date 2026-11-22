import { join } from "node:path";
import ts from "typescript";

// What an editor shows while a part is written, asked of TypeScript's language service over the
// package's sources: the names it suggests inside a literal. Neither jest nor the build asks
// this: jest only transpiles the tests, and the build types the sources alone.

const PACKAGE = join(__dirname, "..", "..", "..");

/** The probe file, held in memory: it imports the parts as an application does */
const PROBE = join(__dirname, "editor-probe.ts");

const PROBE_TEXT = `import { certificate, output } from "../../../src";
declare const address: string;
declare const stake: string;
output({ address, value: {  } });
certificate.voteDelegation({ stake, drep: "" });
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
});
