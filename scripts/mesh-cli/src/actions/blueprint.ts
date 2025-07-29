import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { logError, logInfo, logSuccess } from "../utils";
import { BlueprintParser, TSCodeBuilder } from "@sidan-lab/cardano-bar";
import { blueprintImportCodeMap, jsonImportCodeMap } from "../helpers";

export const blueprint = async (blueprintPath: string, outputPath: string) => {
  const resolvedBlueprintPath = resolve(blueprintPath);
  const resolvedOutputPath = resolve(outputPath);

  try {
    // Validate files
    validateFiles(resolvedBlueprintPath, resolvedOutputPath);

    // Parse blueprint
    const blueprintData = parseBlueprintFile(resolvedBlueprintPath);

    // Parse blueprint using cardano-bar
    logInfo("🔍 Parsing Cardano blueprint...");
    const generatedCode = parseCardanoBlueprint(
      blueprintData,
      resolvedBlueprintPath
    );

    // Ensure output directory exists (following create.ts pattern)
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
    logInfo(`📝 Generated code contains:`);

    // Show summary of what was generated
  } catch (error) {
    logError(error);
    process.exit(1);
  }
};

const validateFiles = (blueprintPath: string, outputPath: string): void => {
  // Validate blueprint file exists
  if (!existsSync(blueprintPath)) {
    logError(`❗ Blueprint file not found: ${blueprintPath}`);
    process.exit(1);
  }

  // Validate blueprint file extension
  if (extname(blueprintPath) !== ".json") {
    logError("❗ Blueprint file must be a JSON file");
    process.exit(1);
  }

  // Validate output file extension - only TypeScript supported
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

  // Create blueprint parser following the json.ts pattern
  const blueprint = new BlueprintParser(
    script,
    jsonImportCodeMap,
    blueprintImportCodeMap,
    new TSCodeBuilder()
  );

  // Generate the code using the same method chain as in json.ts
  blueprint
    .analyzeDefinitions()
    .generateBlueprints()
    .generateImports(blueprintPath)
    .generateTypes();

  // Get the full snippet
  const fullSnippet: string[] = blueprint.getFullSnippet();

  return fullSnippet.join("\n\n");
};
