export type NativeScript =
  | {
      type: 'after' | 'before';
      slot: string;
    }
  | {
      type: 'all' | 'any';
      scripts: NativeScript[];
    }
  | {
      type: 'atLeast';
      required: number;
      scripts: NativeScript[];
    }
  | {
      type: 'sig';
      keyHash: string;
    };
