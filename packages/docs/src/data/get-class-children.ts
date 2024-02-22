import getClass from './get-class';
import { findObjectInArray } from './utils';

export default function getClassChildren(name: string, id: number) {
  const thisClass = getClass(name);

  const children = findObjectInArray({
    array: thisClass.children,
    key: 'id',
    value: id,
  });

  return children;
}
