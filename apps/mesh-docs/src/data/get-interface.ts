import getInterfaces from './get-interfaces';
import { findObjectInArray } from './utils';

export default function getInterface(name: string) {
  const interfaces = getInterfaces();

  return findObjectInArray({
    array: interfaces,
    key: 'name',
    value: name,
  });
}
