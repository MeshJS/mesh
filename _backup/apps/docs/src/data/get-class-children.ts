import getClass from "./get-class";
import { findObjectInArray } from "./utils";

export default function getClassChildren(
  name: string,
  id: number,
  dataSource: string
) {
  const thisClass = getClass(name, dataSource);

  const children = findObjectInArray({
    array: thisClass.children,
    key: "id",
    value: id,
  });

  return children;
}
