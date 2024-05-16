export type PlutusScript = {
  version: LanguageVersion;
  code: string;
};

export type LanguageVersion = 'V1' | 'V2';
