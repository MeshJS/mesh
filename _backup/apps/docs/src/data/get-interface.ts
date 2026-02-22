import getInterfaces from './get-interfaces';
import { findObjectInArray } from './utils';

export default function getInterface(name: string, dataSource: string) {
  const interfaces = getInterfaces(dataSource);

  return findObjectInArray({
    array: interfaces,
    key: 'name',
    value: name,
  });
}
