#!/usr/bin/env node
import path from "path";
import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";

// Contract interface
interface Contract {
  name: string;
  description: string;
  circuits: number;
  files: string[];
}

// Contract templates
const contracts: Record<string, Contract> = {
  tokenization: {
    name: "Tokenization Contract",
    description:
      "Complete project tokenization system with ZK privacy investment",
    circuits: 7,
    files: [
      "contracts/tokenization/tokenization.compact",
      "contracts/tokenization/TokenizationLibrary.compact",
    ],
  },
  staking: {
    name: "Staking Contract",
    description: "Privacy-focused staking system with rewards and lock periods",
    circuits: 8,
    files: ["contracts/staking/staking.compact"],
  },
  identity: {
    name: "Identity Contracts",
    description:
      "Complete identity management system with cryptographic libraries",
    circuits: 1,
    files: [
      "contracts/identity/IdentityLibrary.compact",
      "contracts/identity/registry.compact",
      "contracts/identity/CryptoLibrary.compact",
    ],
  },
  oracle: {
    name: "Oracle Contract",
    description:
      "Decentralized oracle system with privacy-preserving data feeds",
    circuits: 7,
    files: ["contracts/oracle/oracle.compact"],
  },
  lendingBorrowing: {
    name: "Lending & Borrowing Contract",
    description: "Privacy-preserving decentralized lending protocol",
    circuits: 7,
    files: ["contracts/lending-borrowing/lending-borrowing.compact"],
  },
};

async function main(): Promise<void> {
  console.log(chalk.blue.bold("\n✨ Midnight Contracts Wizard\n"));
  console.log(
    chalk.gray(
      "Create a new Midnight contracts project with selected smart contracts\n",
    ),
  );
  console.log(
    chalk.yellow(
      "💡 Tip: Use SPACE to select contracts, then ENTER to continue\n",
    ),
  );

  // Get project name
  const { projectName } = await inquirer.prompt<{ projectName: string }>([
    {
      type: "input",
      name: "projectName",
      message: "What is your project name?",
      default: "my-midnight-contracts",
      validate: (input: string) => {
        if (!input.trim()) {
          return "Project name is required";
        }
        if (!/^[a-z0-9-]+$/.test(input)) {
          return "Project name must contain only lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    },
  ]);

  // Get project directory
  const { projectDir } = await inquirer.prompt<{ projectDir: string }>([
    {
      type: "input",
      name: "projectDir",
      message: "Where should we create your project?",
      default: `./${projectName}`,
      validate: (input: string) => {
        if (!input.trim()) {
          return "Project directory is required";
        }
        return true;
      },
    },
  ]);

  // Select contracts
  const { selectedContracts } = await inquirer.prompt<{
    selectedContracts: string[];
  }>([
    {
      type: "checkbox",
      name: "selectedContracts",
      message: "Which contracts would you like to include?",
      choices: Object.entries(contracts).map(([key, contract]) => ({
        name: `${contract.name} (${contract.circuits} ZK circuits)`,
        short: contract.name,
        value: key,
        checked: false,
      })),
      validate: (input: string[]) => {
        if (!input || input.length === 0) {
          return "Please select at least one contract (use SPACE to select, then ENTER to continue)";
        }
        return true;
      },
    },
  ]);

  // Show summary
  console.log(chalk.green("\n📋 Project Summary:"));
  console.log(chalk.gray(`Project: ${projectName}`));
  console.log(chalk.gray(`Directory: ${projectDir}`));
  console.log(chalk.gray(`Selected contracts: ${selectedContracts.length}`));

  selectedContracts.forEach((key) => {
    const contract = contracts[key];
    if (contract) {
      console.log(
        chalk.blue(`  • ${contract.name} (${contract.circuits} circuits)`),
      );
      console.log(chalk.gray(`    ${contract.description}`));
    }
  });

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: "Create the project with these settings?",
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Project creation cancelled."));
    return;
  }

  // Create project
  const spinner = ora("Creating project...").start();

  try {
    await createProject(projectName, projectDir, selectedContracts);
    spinner.succeed("Project created successfully!");

    console.log(chalk.green("\n🎉 Your Midnight contracts project is ready!"));
    console.log(chalk.gray("\n📋 Next steps:"));
    console.log(chalk.blue("1) Navigate to the project folder:"));
    console.log(chalk.white(`   cd ${projectDir}`));
    console.log(chalk.blue("\n2) Compile your smart contracts:"));
    const compileCommands = generateCompileCommands(selectedContracts);
    compileCommands.forEach((command, index) => {
      console.log(chalk.white(`   ${command}`));
      if (index < compileCommands.length - 1) {
        console.log(chalk.white(""));
      }
    });
    console.log(
      chalk.gray("\n💡 Your contracts will be compiled to src/managed/"),
    );
    console.log(chalk.gray("💡 Check the README.md for detailed instructions"));
  } catch (error) {
    spinner.fail("Failed to create project");
    console.error(chalk.red("Error:"), (error as Error).message);
  }
}

async function createProject(
  projectName: string,
  projectDir: string,
  selectedContracts: string[],
): Promise<void> {
  // Create project directory
  await fs.ensureDir(projectDir);

  // Create package.json
  const packageJson = {
    name: projectName,
    version: "0.1.0",
    license: "MIT",
    type: "module",
    main: "index.js",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    packageManager: "yarn@4.9.2",
    exports: {
      ".": {
        default: "./dist/index.js",
        import: "./dist/index.js",
        types: "./dist/index.d.ts",
        require: "./dist/index.js",
      },
    },
    scripts: {
      compact: generateCompactScript(selectedContracts),
      build: generateBuildScript(selectedContracts),
      lint: "eslint src",
      typecheck: "tsc -p tsconfig.json --noEmit",
      prepack: "yarn build",
    },
    dependencies: {
      "@midnight-ntwrk/compact-runtime": "^0.8.1",
      "@midnight-ntwrk/midnight-js-contracts": "2.0.2",
      "@midnight-ntwrk/midnight-js-types": "2.0.2",
    },
    devDependencies: {
      "@midnight-ntwrk/compact": "^0.8.1",
      eslint: "^9.27.0",
      jest: "^29.7.0",
      typescript: "^5.8.2",
    },
  };

  await fs.writeJson(path.join(projectDir, "package.json"), packageJson, {
    spaces: 2,
  });

  // Create tsconfig files
  await createTsConfig(projectDir);

  // Create src directory structure
  await fs.ensureDir(path.join(projectDir, "src"));
  await fs.ensureDir(path.join(projectDir, "src/managed"));

  // Copy selected contract files from templates
  for (const contractKey of selectedContracts) {
    const contract = contracts[contractKey];
    if (!contract) continue;
    for (const filePath of contract.files) {
      // Get the correct path to contracts directory
      const currentDir = path.dirname(process.argv[1] || __filename);
      const sourcePath = path.join(currentDir, "..", filePath);
      const destPath = path.join(projectDir, filePath);

      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath);
      }
    }
  }

  // Create .yarnrc.yml for standalone project
  const yarnrcContent = `nodeLinker: node-modules
enableGlobalCache: false
`;
  await fs.writeFile(path.join(projectDir, ".yarnrc.yml"), yarnrcContent);

  // Create README
  await createReadme(projectDir, projectName, selectedContracts);

  // Create .gitignore
  await createGitignore(projectDir);
}

function generateCompileCommands(selectedContracts: string[]): string[] {
  return selectedContracts
    .map((contractKey) => {
      const contract = contracts[contractKey];
      if (!contract) return [];
      return contract.files.map((file) => {
        const fileName = path.basename(file, ".compact");
        return `compact compile ${file} ./src/managed/${fileName}`;
      });
    })
    .flat();
}

function generateCompactScript(selectedContracts: string[]): string {
  const commands = generateCompileCommands(selectedContracts);
  return commands.join(" && ");
}

function generateBuildScript(selectedContracts: string[]): string {
  const copyCommands = selectedContracts
    .map((contractKey) => {
      const contract = contracts[contractKey];
      if (!contract) return [];
      return contract.files.map((file) => {
        const fileName = path.basename(file, ".compact");
        return `test -d ./src/managed/${fileName} && cp -R ./src/managed/${fileName} ./dist/managed/`;
      });
    })
    .flat();

  const copySourceFiles = selectedContracts
    .map((contractKey) => {
      const contract = contracts[contractKey];
      if (!contract) return [];
      return contract.files.map((file) => `cp ${file} dist`);
    })
    .flat();

  return `rm -rf dist && find src/managed -type d -empty -delete && tsc --project tsconfig.build.json && mkdir -p dist/managed && ${copyCommands.join(" && ")} && ${copySourceFiles.join(" && ")}`;
}

async function createTsConfig(projectDir: string): Promise<void> {
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "node",
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      strict: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      outDir: "./dist",
      rootDir: "./src",
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  const tsconfigBuild = {
    extends: "./tsconfig.json",
    compilerOptions: {
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    exclude: ["**/*.test.ts", "**/*.spec.ts"],
  };

  await fs.writeJson(path.join(projectDir, "tsconfig.json"), tsconfig, {
    spaces: 2,
  });
  await fs.writeJson(
    path.join(projectDir, "tsconfig.build.json"),
    tsconfigBuild,
    { spaces: 2 },
  );
}

async function createReadme(
  projectDir: string,
  projectName: string,
  selectedContracts: string[],
): Promise<void> {
  const selectedContractNames = selectedContracts
    .map((key) => contracts[key])
    .filter((contract): contract is Contract => contract !== undefined)
    .map((contract) => contract.name);

  const compileCommands = generateCompileCommands(selectedContracts);
  const compileCommandsText = compileCommands.join("\n\n");

  const readme = `# Midnight Contracts Wizard

A Midnight contracts project with the following smart contracts:

${selectedContractNames.map((name) => `- ${name}`).join("\n")}

## Quick Start

\`\`\`bash
# Compile smart contracts (IMPORTANT!)
${compileCommandsText}
\`\`\`

## 🔥 Compiling Smart Contracts

**This is the most important step!** Your \`.compact\` files need to be compiled before use:

\`\`\`bash
# Compile each contract individually:
${compileCommandsText}
\`\`\`

### What gets generated after compilation:

\`\`\`
src/managed/
├── tokenization/           # Compiled tokenization contract
│   ├── compiler/          # Compilation artifacts
│   ├── contract/          # Contract bytecode
│   ├── keys/              # Cryptographic keys
│   └── zkir/              # ZK proof system files
└── TokenizationLibrary/   # Compiled library
    ├── compiler/
    ├── contract/
    ├── keys/
    └── zkir/
\`\`\`

## What's Included

- **Smart Contracts**: Ready-to-compile \`.compact\` files in \`contracts/\`
- **Dependencies**: All necessary Midnight Network packages
- **Build Scripts**: Automated compilation and build process
- **TypeScript**: Full TypeScript support with type definitions
- **Standalone Project**: Includes \`.yarnrc.yml\` for independent operation

## Available Commands

- \`compact compile [source] [output]\` - **Compile individual smart contracts**

## Project Structure

\`\`\`
${projectName}/
├── contracts/         # Source contract files (.compact)
├── src/
│   ├── managed/        # Compiled contracts (after compact compile)
│   └── index.ts      # Your application code
└── package.json       # Dependencies and scripts
\`\`\`

---

<div align="center">
  <p>Powered by <a href="https://meshjs.dev/">MeshJS Team</a></p>
  <p>Built with ❤️ on Midnight Network</p>
</div>
`;

  await fs.writeFile(path.join(projectDir, "README.md"), readme);
}

async function createGitignore(projectDir: string): Promise<void> {
  const gitignoreContent = `# Compiled contracts (generated by compact compile)
src/managed/

# Node modules
node_modules/

# Build outputs
dist/
build/

# Environment files
.env
.env.local
.env.production

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Midnight Network compilation artifacts
*.prover
*.verifier
*.zkir
`;

  await fs.writeFile(path.join(projectDir, ".gitignore"), gitignoreContent);
}

// Run the CLI
if (require.main === module) {
  main().catch(console.error);
}

export { main };
