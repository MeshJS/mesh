export type Json = {
  [key: string]: Content;
};

type Content =
  | string
  | number
  | Content[]
  | { [key: string]: Content; };
