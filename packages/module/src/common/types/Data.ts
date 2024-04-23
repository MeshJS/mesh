export type Data =
  | string
  | number
  | bigint
  | Array<Data>
  | Map<Data, Data>
  | {
      alternative: number;
      fields: Array<Data>;
    };
