export type Json = {
  [key: string]: JsonContent;
};

export type JsonContent =
  | string
  | number
  | JsonContent[]
  | { [key: string]: JsonContent; };
