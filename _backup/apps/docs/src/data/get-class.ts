import getClasses from "./get-classes";
import { findObjectInArray } from "./utils";

export default function getClass(name, dataSource: string) {
  const classes = getClasses(dataSource);

  const meshClass = findObjectInArray({
    array: classes,
    key: "name",
    value: name,
  });

  return meshClass;
}
