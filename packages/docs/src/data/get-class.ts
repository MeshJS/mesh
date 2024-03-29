import getClasses from './get-classes';
import { findObjectInArray } from './utils';

export default function getClass(name) {
  const classes = getClasses();

  const meshClass = findObjectInArray({
    array: classes,
    key: 'name',
    value: name,
  });

  return meshClass;
}
