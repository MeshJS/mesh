import getFunctions from './get-functions';
import { findObjectInArray } from './utils';

export default function getFunction(name: string) {
  const functions = getFunctions();

  return findObjectInArray({
    array: functions,
    key: 'name',
    value: name,
  });
}
