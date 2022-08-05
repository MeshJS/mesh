export type JsonContent =
  | string
  | number
  | JsonContent[]
  | { [key: string]: JsonContent };
