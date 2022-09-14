export type Data =
  | string
  | number
  | Array<Data>
  | Map<Data, Data>
  | {
      alternative: number;
      fields: Array<Data>;
    };
