import {json} from '../core/http.js';
import {supabaseRequest} from '../core/supabase.js';
import {duplicateResource,sendResource} from './duplicate.js';

const failures={
 invalid_copy_request:400,invalid_copy_name:400,unsupported_copy_image_source:400,
 invalid_copy_storage_plan:400,copy_image_source_changed:409,copy_image_conflict:409,
 auth_required:401,not_found:404,received_copy_pending:409,not_exportable:409,
 resource_in_use:409,request_conflict:409,previously_removed:410,
 copy_name_unavailable:409,expired:410,
 not_friend:409,already_sent:409,declined_cooldown:429,demo_not_sendable:409,
};
async function handleResourceAction(request,env,action){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const token=request.headers.get('Authorization')||'';
 if(!/^Bearer [^\s]+$/.test(token))return json({ok:false,error:'auth_required'},401);
 // The subject always comes from Supabase Auth. Body fields such as actor,
 // recipient or ownership cannot choose the clone destination.
 const authenticated=await supabaseRequest(env,'/auth/v1/user',{headers:{Authorization:token}});
 if(!authenticated.ok||!authenticated.data?.id)return json({ok:false,error:'auth_required'},401);
 let input;
 try{
  const text=await request.text();if(text.length>2048)throw new Error('body too large');
  input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid body');
 }catch{return json({ok:false,error:'invalid_copy_request'},400);}
 try{
  const result=action==='send'?await sendResource(env,authenticated.data.id,input):await duplicateResource(env,authenticated.data.id,input);
  return json(result,result?.ok?200:failures[result?.error]||503);
 }catch(error){
  const code=error.databaseCode==='55P03'?'resource_in_use':Object.hasOwn(failures,error.message)?error.message:'copy_failed';
  return json({ok:false,error:code},failures[code]||503);
 }
}
export const handleResourceDuplicate=(request,env)=>handleResourceAction(request,env,'duplicate');
export const handleResourceSend=(request,env)=>handleResourceAction(request,env,'send');
