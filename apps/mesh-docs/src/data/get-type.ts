import getTypes from './get-types';
import { findObjectInArray } from './utils';

export default function getType(name: string) {
  const types = getTypes();

  return findObjectInArray({
    array: types,
    key: 'name',
    value: name,
  });
}
