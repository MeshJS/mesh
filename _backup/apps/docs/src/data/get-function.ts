import getFunctions from './get-functions';
import { findObjectInArray } from './utils';

export default function getFunction(name: string, dataSource: string) {
  const functions = getFunctions(dataSource);

  return findObjectInArray({
    array: functions,
    key: 'name',
    value: name,
  });
}
