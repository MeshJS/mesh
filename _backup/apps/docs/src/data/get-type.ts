import getTypes from "./get-types";
import { findObjectInArray } from "./utils";

export default function getType(name: string, dataSource: string) {
  const types = getTypes(dataSource);

  return findObjectInArray({
    array: types,
    key: "name",
    value: name,
  });
}
