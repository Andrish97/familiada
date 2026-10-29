import test from 'node:test';
import assert from 'node:assert/strict';
import { reservedUsernameReason } from '../../web/shared/js/core/reserved-usernames.js';
test('reserved prefixes are case-insensitive and include all suffixes',()=>{
 for(const name of ['test1','TEST26',' test999 ','tester','test_user']) assert.equal(reservedUsernameReason(name),'test');
 for(const name of ['familiada','ADMIN','administrator','moderator','support','pomoc','kontakt','contact','system','official','security','billing','noreply']) assert.equal(reservedUsernameReason(name),'system');
 for(const name of ['admin123','familiada_team','support_help']) assert.equal(reservedUsernameReason(name),'system');
 for(const name of ['contest','guest_regular','anna']) assert.equal(reservedUsernameReason(name),null);
});
