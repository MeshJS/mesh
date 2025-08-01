import chalk from "chalk";
import figlet from "figlet";
import {
  createArgument,
  createCommand,
  createOption,
  InvalidArgumentError,
} from "commander";
import { create, blueprint } from "./actions";
import { logError, logSuccess, logInfo } from "./utils";

const main = async () => {
  console.clear();

  console.info(
    chalk.blueBright(
      figlet.textSync("MeshJS", {
        font: "Larry 3D",
        horizontalLayout: "full",
      })
    )
  );

  console.log("\n");

  const program = createCommand();

  program
    .name("meshjs")
    .description("A quick and easy way to bootstrap your Web3 app using Mesh.")
    .version("1.0.0");

  program
    .addArgument(
      createArgument("name", "Set a name for your app.")
        .argParser((name) => {
          if (/^([A-Za-z\-\\_\d])+$/.test(name)) return name;

          throw new InvalidArgumentError(
            chalk.redBright(
              "❗ Only letters, numbers, underscores and, hashes are allowed."
            )
          );
        })
        .argRequired()
    )
    .addOption(
      createOption(
        "-t, --template <TEMPLATE-NAME>",
        `The template to start your project from.`
      ).choices(["nextjs", "aiken"])
    )
    .addOption(
      createOption(
        "-s, --stack <STACK-NAME>",
        `The tech stack you want to build on.`
      ).choices(["next"])
    )
    .addOption(
      createOption(
        "-l, --language <LANGUAGE-NAME>",
        `The language you want to use.`
      ).choices(["ts"])
    )
    .action(create);

  program
    .command("blueprint")
    .description("Generate TypeScript code from Cardano blueprint")
    .addArgument(
      createArgument(
        "blueprint-path",
        "Path to the blueprint JSON file"
      ).argRequired()
    )
    .addArgument(
      createArgument(
        "output-path",
        "Path to the output TypeScript file"
      ).argRequired()
    )
    .action(blueprint);

  await program.parseAsync(process.argv);
};

main()
  .then(() => {
    if (process.argv.includes("create")) {
      logSuccess("✨✨ Welcome to Web 3.0! ✨✨");
      logInfo('Run "cd <project-name>" and "npm run dev" to start your app.');
    }
    process.exit(0);
  })
  .catch((error) => {
    logError(error);
    process.exit(1);
  });
