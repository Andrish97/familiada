import test from 'node:test';
import assert from 'node:assert/strict';
import {isManualButton} from '../../web/manual/js/controls.js';

test('UI buttons in old and new manual sections share the control style',()=>{
 for(const [lang,values] of Object.entries({pl:['Edytuj','Zakończ finał','Zapisz wszystko'],en:['Edit','Finish final','Save all'],uk:['Редагувати','Завершити фінал','Зберегти все']})){
  for(const value of values)assert.equal(isManualButton(value,lang),true);
 }
 assert.equal(isManualButton('','pl',{hasIcon:true}),true);
});
test('shortcuts, values, statuses and contestant speech remain plain code',()=>{
 for(const lang of ['pl','en','uk'])for(const value of ['Ctrl + Enter','Win + P','⌘ F1','Fn','30×10','150×70','1,1,1,2,3','0,5','familiada.online','—'])assert.equal(isManualButton(value,lang),false);
 for(const [lang,text]of[['pl','powtórzenie'],['en','repeat'],['uk','повтор']])assert.equal(isManualButton(text,lang),false);
 assert.equal(isManualButton('Dalej','pl',{context:'Dalej wypowiedziane przez zawodnika nie zamyka pytania'}),false);
 assert.equal(isManualButton('Next','en',{context:'A contestant saying Next does not close the question'}),false);
});
