export type Data =
  | string
  | number
  | Data[]
  | { [key: string]: Data };
