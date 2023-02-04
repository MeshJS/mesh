import { LANGUAGE_VERSIONS } from '../constants';

export type PlutusScript = {
  version: LanguageVersion;
  code: string;
};

export type LanguageVersion =
  keyof typeof LANGUAGE_VERSIONS;
