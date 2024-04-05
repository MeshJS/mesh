import data from './api.json';
import { findObjectInArray } from './utils';

export default function getChildrenById(id: number) {
  const child = findObjectInArray({
    array: data.children,
    key: 'id',
    value: id,
  });
  if (child) {
    if (child.kind) {
      if (child.kind == 128) child.kind = 'Class';
      // if(child.kind == 256) child.kind = 'Interface';
      // if(child.kind == 512) child.kind = 'Constructor';
      // if(child.kind == 1024) child.kind = '';
      // if(child.kind == 2048) child.kind = 'Function';
      if (child.kind == 2097152) child.kind = 'Type';
    }
  }
  return child;
}
