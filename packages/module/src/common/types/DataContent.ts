export type DataContent =
  | string
  | number
  | DataContent[]
  | { [key: string]: DataContent };
