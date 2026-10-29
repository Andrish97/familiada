const {test,expect}=require('./helpers/e2e-test');
const {loginAsGuest}=require('./helpers/login');
test.use({needs:{standard:1}});
// Lista wykluczeń ze statystyk (stats_excluded_list) jest tylko dla service_role
// (migracja 444, panel admina przez Worker) -- zwykły użytkownik dostaje odmowę.
// Automatyczne wykluczenie sprawdzamy więc po skutku: ocena aplikacji wystawiona
// przez konto testowe nie zmienia publicznej liczby ocen (get_app_rating_stats).
test('activity production: actual ping, shared automatic exclusion and database prefix reservation',async({page,context,accounts,loginAs})=>{
 await loginAs(page,context,accounts.standard[0]);
 const result=await page.evaluate(async()=>{
  const client=window.__sbClient;
  const {data:{user}}=await client.auth.getUser();
  const before=await client.from('profiles').select('username').eq('id',user.id).single();
  const ping=await client.rpc('site_activity_ping',{p_tab_id:crypto.randomUUID(),p_page:'games'});
  const listed=await client.rpc('stats_excluded_list');
  const statsBefore=await client.rpc('get_app_rating_stats');
  const rated=await client.from('app_ratings').upsert({user_id:user.id,stars:5,comment:null},{onConflict:'user_id'});
  const statsAfter=await client.rpc('get_app_rating_stats');
  const denied=await client.rpc('get_maintenance_activity');
  const blocked=await client.from('profiles').update({username:'AdMiN_'+Date.now()}).eq('id',user.id);
  const after=await client.from('profiles').select('username').eq('id',user.id).single();
  return {ping:ping.error?.message,listDenied:!!listed.error,rateError:rated.error?.message,ratingCount:[statsBefore.data?.[0]?.total_count,statsAfter.data?.[0]?.total_count],denied:!!denied.error,blocked:blocked.error?.code,before:before.data?.username,after:after.data?.username};
 });
 expect(result.ping).toBeUndefined();expect(result.listDenied).toBe(true);
 expect(result.rateError).toBeUndefined();expect(result.ratingCount[0]).toBeDefined();expect(result.ratingCount[1]).toBe(result.ratingCount[0]);
 expect(result.denied).toBe(true);expect(result.blocked).toBe('23505');expect(result.after).toBe(result.before);
});
test('activity production: only explicitly marked E2E guests receive automatic test exclusion',async({page,context})=>{
 await loginAsGuest(page,context);
 let result;
 try{
  result=await page.evaluate(async()=>{
   const client=window.__sbClient;
   const {data:{user}}=await client.auth.getUser();
   const listed=await client.rpc('stats_excluded_list');
   const statsBefore=await client.rpc('get_app_rating_stats');
   const rated=await client.from('app_ratings').insert({user_id:user.id,stars:5,comment:null});
   const statsAfter=await client.rpc('get_app_rating_stats');
   return {marked:user.app_metadata.is_test_guest,listDenied:!!listed.error,rateError:rated.error?.message,ratingCount:[statsBefore.data?.[0]?.total_count,statsAfter.data?.[0]?.total_count]};
  });
 }finally{
  // Gość założony w teście -- usuwamy go na końcu (tests/README.md „Test accounts”).
  await page.evaluate(()=>window.__sbClient.functions.invoke('delete-account',{method:'POST'})).catch(()=>{});
 }
 expect(result.marked).toBe(true);expect(result.listDenied).toBe(true);
 // 514: gość nie ocenia systemu (jak w interfejsie) -- zapis odrzucony, statystyki bez zmian.
 expect(result.rateError).toMatch(/row-level security/);expect(result.ratingCount[0]).toBeDefined();expect(result.ratingCount[1]).toBe(result.ratingCount[0]);
});
