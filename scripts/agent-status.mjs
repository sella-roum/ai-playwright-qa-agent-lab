import { readJson } from './agent-lib.mjs';
const state = await readJson('.agent/state.json');
console.log(JSON.stringify(state, null, 2));
