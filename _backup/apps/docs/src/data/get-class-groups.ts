import getClass from "./get-class";
import { findObjectInArray } from "./utils";

export default function getClassGroups(name, dataSource: string) {
  if (!name) return [];

  const thisClass = getClass(name, dataSource);

  const groups = thisClass.groups.map((group) => {
    return {
      title: group.title,
      children: group.children
        .map((id) => {
          return findObjectInArray({
            array: thisClass.children,
            key: "id",
            value: id,
          });
        })
        .filter((child) => {
          if (child.flags.isPrivate == true || child.flags.isProtected == true)
            return false;
          return true;
        }),
    };
  });

  if (!groups) return [];

  return groups;
}
