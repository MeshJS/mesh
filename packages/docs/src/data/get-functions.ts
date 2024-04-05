import data from './api.json';
import { findObjectInArray } from './utils';

export default function getFunctions() {
  const group = findObjectInArray({
    array: data.groups,
    key: 'title',
    value: 'Functions',
  });

  const classes = group.children.map((child: any) => {
    const classData = findObjectInArray({
      array: data.children,
      key: 'id',
      value: child,
    });
    return classData;
  });

  return classes;
}
