// generateReduxFiles.js
const fs = require('fs');
const path = require('path');

const createActionFile = name => {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  const content = `
// ${name}.ts
export const ADD_${name.toUpperCase()} = 'ADD_${name.toUpperCase()}';
export const UPDATE_${name.toUpperCase()} = 'UPDATE_${name.toUpperCase()}';
export const RESET_${name.toUpperCase()} = 'RESET_${name.toUpperCase()}';

export interface Add${capitalized} {
  type: typeof ADD_${name.toUpperCase()};
  data: any;
}

export interface Update${capitalized} {
  type: typeof UPDATE_${name.toUpperCase()};
  data: any;
}

export interface Reset${capitalized} {
  type: typeof RESET_${name.toUpperCase()};
}

export type ${capitalized}ActionTypes = Add${capitalized} | Update${capitalized} | Reset${capitalized};

export function add${name}(data: any): Add${capitalized} {
  return { type: ADD_${name.toUpperCase()}, data }
}

export function update${name}(data: any): Update${capitalized} {
  return { type: UPDATE_${name.toUpperCase()}, data }
}

export function reset${name}(): Reset${capitalized} {
  return { type: RESET_${name.toUpperCase()} }
}
`;

  fs.writeFileSync(path.join(__dirname, 'actions', `${name}.ts`), content);
};

const createReducerFile = name => {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  const content = `
// ${name}.ts
import { ADD_${name.toUpperCase()}, UPDATE_${name.toUpperCase()}, RESET_${name.toUpperCase()}, ${capitalized}ActionTypes } from '../actions/${name}';

const initialState: any[] = [];

function ${name}(state = initialState, action: ${capitalized}ActionTypes): any[] {
  switch (action.type) {
    case ADD_${name.toUpperCase()}:
      return [...state, action.data];
    case UPDATE_${name.toUpperCase()}:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_${name.toUpperCase()}:
      return [];
    default:
      return state;
  }
}

export default ${name};
`;

  fs.writeFileSync(path.join(__dirname, 'reducers', `${name}.ts`), content);
};

const name = process.argv[2];
if (!fs.existsSync(path.join(__dirname, 'actions'))) {
  fs.mkdirSync(path.join(__dirname, 'actions'));
}
if (!fs.existsSync(path.join(__dirname, 'reducers'))) {
  fs.mkdirSync(path.join(__dirname, 'reducers'));
}

createActionFile(name);
createReducerFile(name);
