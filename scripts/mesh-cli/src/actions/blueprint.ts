import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { logError, logInfo, logSuccess } from "../utils";
import { BlueprintParser, TSCodeBuilder } from "@sidan-lab/cardano-bar";
import { blueprintImportCodeMap, jsonImportCodeMap } from "../helpers";

export const blueprint = async (blueprintPath: string, outputPath: string) => {
  const resolvedBlueprintPath = resolve(blueprintPath);
  const resolvedOutputPath = resolve(outputPath);

  try {
    validateFiles(resolvedBlueprintPath, resolvedOutputPath);

    const blueprintData = parseBlueprintFile(resolvedBlueprintPath);

    logInfo("🔍 Parsing Cardano blueprint...");
    const generatedCode = parseCardanoBlueprint(
      blueprintData,
      resolvedBlueprintPath
    );

    const outputDir = dirname(resolvedOutputPath);
    if (!existsSync(outputDir)) {
      if (mkdirSync(outputDir, { recursive: true }) === undefined) {
        logError("❌ Unable to create output directory.");
        process.exit(1);
      }
    }

    logInfo("💾 Writing generated code to file...");
    writeFileSync(resolvedOutputPath, generatedCode);

    logSuccess(`✨ Generated TypeScript file: ${resolvedOutputPath}`);
  } catch (error) {
    logError(error);
    process.exit(1);
  }
};

const validateFiles = (blueprintPath: string, outputPath: string): void => {
  if (!existsSync(blueprintPath)) {
    logError(`❗ Blueprint file not found: ${blueprintPath}`);
    process.exit(1);
  }

  if (extname(blueprintPath) !== ".json") {
    logError("❗ Blueprint file must be a JSON file");
    process.exit(1);
  }

  if (extname(outputPath) !== ".ts") {
    logError("❗ Output file must have .ts extension");
    process.exit(1);
  }
};

const parseBlueprintFile = (blueprintPath: string): any => {
  logInfo("📖 Reading and parsing blueprint file...");
  const blueprintContent = readFileSync(blueprintPath, "utf8");

  try {
    return JSON.parse(blueprintContent);
  } catch (error) {
    logError("❗ Invalid JSON in blueprint file");
    process.exit(1);
  }
};

const parseCardanoBlueprint = (script: any, blueprintPath: string): string => {
  logInfo("⚡ Generating TypeScript code...");

  const blueprint = new BlueprintParser(
    script,
    jsonImportCodeMap,
    blueprintImportCodeMap,
    new TSCodeBuilder()
  );

  blueprint
    .analyzeDefinitions()
    .generateBlueprints()
    .generateImports(blueprintPath)
    .generateTypes();

  const fullSnippet: string[] = blueprint.getFullSnippet();

  return fullSnippet.join("\n\n");
};
