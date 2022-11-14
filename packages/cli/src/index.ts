import chalk from 'chalk';
import figlet from 'figlet';
import {
  createArgument, createCommand,
  createOption, InvalidArgumentError,
} from 'commander';
import { create } from './actions';
import { logError, logSuccess } from './utils';

const main = async () => {
  console.clear();

  console.info(
    chalk.blue(
      figlet.textSync('Create Mesh dApp', {
        font: 'Speed', horizontalLayout: 'full',
      })
    )
  );

  console.log('\n');

  const program = createCommand();

  program
    .name('create-mesh-dapp')
    .description(
      'A quick and easy way to bootstrap your dApps on Cardano using Mesh.'
    )
    .version('1.0.0');

  program
    .addArgument(
      createArgument('name', 'Set a name for your dApp.')
        .argParser((name) => {
          if (/^([A-Za-z\-\\_\d])+$/.test(name)) return name;

          throw new InvalidArgumentError(
            chalk.redBright(
              '❗ Only letters, numbers, underscores and, hashes are allowed.',
            ),
          );
        })
        .argRequired()
    )
    .addOption(
      createOption(
        '-t, --template <TEMPLATE-NAME>',
        `The template to start your project from.`
      ).choices(['starter', 'minting', 'marketplace'])
    )
    .addOption(
      createOption(
        '-s, --stack <STACK-NAME>',
        `Choose a tech stack.`
      ).choices(['next', 'remix'])
    )
    .addOption(
      createOption(
        '-l, --language <LANGUAGE-NAME>',
        `Select a language.`
      ).choices(['js', 'ts'])
    )
    .action(create);

  await program.parseAsync(process.argv);
};

main()
  .then(() => {
    logSuccess('✨✨ Welcome to Web 3.0! ✨✨');
    process.exit(0);
  })
  .catch((error) => {
    logError(error);
    process.exit(1);
  });
