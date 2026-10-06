const {test,expect}=require('@playwright/test');
const {loginAsTestUser,loginAsGuest}=require('./helpers/login');
test('activity production: actual ping, shared automatic exclusion and database prefix reservation',async({page,context})=>{
 await loginAsTestUser(page,context);
 const result=await page.evaluate(async()=>{
  const client=window.__sbClient;
  const {data:{user}}=await client.auth.getUser();
  const before=await client.from('profiles').select('username').eq('id',user.id).single();
  const ping=await client.rpc('site_activity_ping',{p_tab_id:crypto.randomUUID(),p_page:'games'});
  const excluded=await client.rpc('stats_excluded_list');
  const denied=await client.rpc('get_maintenance_activity');
  const blocked=await client.from('profiles').update({username:'AdMiN_'+Date.now()}).eq('id',user.id);
  const after=await client.from('profiles').select('username').eq('id',user.id).single();
  return {ping:ping.error?.message,excluded:excluded.data?.find(x=>x.user_id===user.id),denied:!!denied.error,blocked:blocked.error?.code,before:before.data?.username,after:after.data?.username};
 });
 expect(result.ping).toBeUndefined();expect(result.excluded?.automatic).toBe(true);expect(result.excluded?.reason).toBe('test_account');
 expect(result.denied).toBe(true);expect(result.blocked).toBe('23505');expect(result.after).toBe(result.before);
});
test('activity production: only explicitly marked E2E guests receive automatic test exclusion',async({page,context})=>{
 await loginAsGuest(page,context);
 const result=await page.evaluate(async()=>{
  const client=window.__sbClient;
  const {data:{user}}=await client.auth.getUser();
  const excluded=await client.rpc('stats_excluded_list');
  return {marked:user.app_metadata.is_test_guest,exclusion:excluded.data?.find(x=>x.user_id===user.id)};
 });
 expect(result.marked).toBe(true);expect(result.exclusion?.automatic).toBe(true);expect(result.exclusion?.reason).toBe('test_guest');
});
