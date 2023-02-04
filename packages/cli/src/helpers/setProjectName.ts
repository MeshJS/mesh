import { EOL } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

export const setProjectName = (path, name) => {
  const packagePath = join(path, 'package.json');
  const packageContent = readFileSync(packagePath);
  const packageJson = JSON.parse(packageContent.toString());

  if (packageJson) {
    packageJson.name = name;
  }

  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + EOL);
};
