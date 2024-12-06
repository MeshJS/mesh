// import { execSync } from 'child_process';

export const resolvePkgManager = () => {
  return 'npm';
  // try {
  //   const userAgent = process.env.npm_config_user_agent;
  //   if (userAgent?.startsWith('yarn')) {
  //     return 'yarn';
  //   }

  //   if (userAgent?.startsWith('pnpm')) {
  //     return 'pnpm';
  //   }

  //   try {
  //     execSync('yarn --version', { stdio: 'ignore' });
  //     return 'yarn';
  //   } catch (_) {
  //     execSync('pnpm --version', { stdio: 'ignore' });
  //     return 'pnpm';
  //   }
  // } catch (_) {
  //   return 'npm';
  // }
};
