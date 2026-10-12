import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/control/js/app.js', import.meta.url),'utf8');
const body = source.match(/function applyTeamNamesToState\(teams, state\) \{([\s\S]*?)\n\}/)[1];
for (const lang of ['pl','en','uk']) test(`Control: domyślne i własne nazwy drużyn — ${lang}`, async () => {
  const dict = (await import(`../../web/shared/translation/${lang}.js`)).default;
  const apply = new Function('t','teams','state',body).bind(null,key=>dict.control[key.split('.').at(-1)]);
  const state = {teams:{}};
  apply({teamA:'',teamB:'   '},state);
  assert.deepEqual(state.teams,{teamA:dict.control.teamADefault,teamB:dict.control.teamBDefault});
  apply({teamA:'Kasztany',teamB:null},state);
  assert.deepEqual(state.teams,{teamA:'Kasztany',teamB:dict.control.teamBDefault});
  apply({teamA:'Kasztany',teamB:'Wygnani'},state);
  assert.deepEqual(state.teams,{teamA:'Kasztany',teamB:'Wygnani'});
});
