import { execSync } from 'child_process';

export const tryGitInit = () => {
  try {
    execSync('git --version', { stdio: 'ignore' });

    if (isInGitRepository() || isInMercurialRepository()) {
      return false;
    }

    execSync('git init', { stdio: 'ignore' });
    execSync('git checkout -b main', { stdio: 'ignore' });
    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit from npx mesh-create-dapp"', {
      stdio: 'ignore',
    });
    return true;
  } catch (_) {
    return false;
  }
};

const isInGitRepository = () => {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (_) {}
  return false;
};

const isInMercurialRepository = () => {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (_) {}
  return false;
};
