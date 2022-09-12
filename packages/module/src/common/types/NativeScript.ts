export type NativeScript = {
  slot?: string;
  keyHash?: string;
  required?: number;
  scripts?: NativeScript[];
  type: 'all' | 'after' | 'any' | 'atLeast' | 'before' | 'sig';
};
