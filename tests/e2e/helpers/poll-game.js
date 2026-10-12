const {expect}=require('@playwright/test');
// Own pooled test games only; cleanup is the caller's responsibility.
async function rpc(page,name,args){return page.evaluate(async({name,args})=>{const {data,error}=await window.__sbClient.rpc(name,args);if(error)throw new Error(error.message);return data;},{name,args});}
async function seed(page,type){return page.evaluate(async type=>{
 const db=window.__sbClient;const {data:user,error:authError}=await db.auth.getUser();if(authError)throw authError;
 const {data:game,error}=await db.from('games').insert({owner_id:user.user.id,name:`E2E-ANON362-${type}-${Date.now()}`,type,status:'draft'}).select('id,share_key_poll').single();if(error)throw error;
 try {
  const {data:questions,error:qError}=await db.from('questions').insert(Array.from({length:10},(_,i)=>({game_id:game.id,ord:i+1,text:`Co zabieramy na wakacje? ${i+1}`}))).select('id,ord');if(qError)throw qError;
  if(type==='poll_points') {const {error:aError}=await db.from('answers').insert(questions.flatMap(q=>Array.from({length:3},(_,i)=>({question_id:q.id,ord:i+1,text:['Książkę','Piłkę','Aparat'][i],fixed_points:10}))));if(aError)throw aError;}
  const {error:oError}=await db.rpc('poll_open',{p_game_id:game.id,p_key:game.share_key_poll});if(oError)throw oError;
  const {data:opened,error:kError}=await db.from('games').select('share_key_poll').eq('id',game.id).single();if(kError)throw kError;
  return {id:game.id,key:opened.share_key_poll};
 }catch(error){await db.from('games').delete().eq('id',game.id);throw error;}
},type);}
async function count(page,gameId,type){return page.evaluate(async({gameId,type})=>{const {count,error}=await window.__sbClient.from(type==='poll_text'?'poll_text_entries':'poll_votes').select('id',{head:true,count:'exact'}).eq('game_id',gameId);if(error)throw error;return count;},{gameId,type});}
async function complete(page,type){
 for(let i=1;i<=10;i++){
  await expect(page.locator('.qtext')).toContainText(`? ${i}`);
  if(type==='poll_text'){await page.locator('#answerInput').fill('Książkę');await page.locator('#btnSend').click();}
  else await page.locator('.alist button').first().click();
 }
}

module.exports={rpc,seed,count,complete};
