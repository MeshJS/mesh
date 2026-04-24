import getData from "./get-data";
import { findObjectInArray } from "./utils";

export default function getClasses(dataSource: string) {
  let data: any = getData(dataSource);
  if (data === undefined) return [];

  const groupClasses = findObjectInArray({
    array: data.groups,
    key: "title",
    value: "Classes",
  });

  const classes = groupClasses.children.map((child: any) => {
    const classData = findObjectInArray({
      array: data.children,
      key: "id",
      value: child,
    });
    return classData;
  });

  if (!classes) return [];

  return classes;
}
