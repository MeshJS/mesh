import data from './api.json';
import { findObjectInArray } from './utils';

export default function getClasses() {
  const groupClasses = findObjectInArray({
    array: data.groups,
    key: 'title',
    value: 'Classes',
  });

  const classes = groupClasses.children.map((child: any) => {
    const classData = findObjectInArray({
      array: data.children,
      key: 'id',
      value: child,
    });
    return classData;
  });

  return classes;
}
