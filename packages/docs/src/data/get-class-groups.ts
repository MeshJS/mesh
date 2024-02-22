import getClass from './get-class';
import { findObjectInArray } from './utils';

export default function getClassGroups(name: string) {
  const thisClass = getClass(name);

  const groups = thisClass.groups.map((group: any) => {
    return {
      title: group.title,
      children: group.children
        .map((id: number) => {
          return findObjectInArray({
            array: thisClass.children,
            key: 'id',
            value: id,
          });
        })
        .filter((child: any) => {
          if (child.flags.isPrivate == true || child.flags.isProtected == true) return false;
          return true;
        }),
    };
  });

  return groups;
}
