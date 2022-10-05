import { LANGUAGE_VERSIONS } from '../constants';

export type PlutusScript = {
  code: string;
  version: LanguageVersion;
};

export type LanguageVersion = keyof typeof LANGUAGE_VERSIONS;
