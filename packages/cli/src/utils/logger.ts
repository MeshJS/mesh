import chalk from 'chalk';

export const logError = (message) => {
  console.log(chalk.redBright(message + '\n'));
};

export const logSuccess = (message) => {
  console.log(chalk.greenBright(message + '\n'));
};

export const logInfo = (message) => {
  console.log(chalk.blueBright(message + '\n'));
};
