export function findObjectInArray({
  array,
  key,
  value,
}: {
  array: any[];
  key: string;
  value: any;
}) {
  return array.find((x: any) => x[key] === value);
}
