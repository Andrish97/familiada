import {sb} from './supabase.js?v=v2026-10-18T06365';
import {getUiLang,t} from '../../translation/translation.js?v=v2026-10-18T06365';
import {toast} from './toast.js?v=v2026-10-18T06365';
import {sendResourceCopyMail} from './invite-mail.js?v=v2026-10-18T06365';
import {icon,iconText} from './icons.js?v=v2026-10-18T06365';

const attempts=new Map();
function getDialog(){
 let dialog=document.getElementById('resourceSendDialog');if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.id='resourceSendDialog';dialog.className='resource-send-dialog';
 dialog.innerHTML='<form method="dialog" class="resource-send"><header><h2></h2><button class="btn sm" value="cancel" aria-label="Close"></button></header><p class="resource-send-name"></p><div class="resource-send-friends"></div><details class="resource-send-history"><summary></summary><div></div></details><p class="resource-send-error" role="status"></p><footer><button class="btn sm" value="cancel"></button><button class="btn sm gold" type="button" data-send></button></footer></form>';
 Object.assign(dialog.style,{padding:'20px',maxWidth:'520px',width:'calc(100% - 32px)',color:'var(--text,#fff)',background:'var(--panel,#202126)',border:'1px solid var(--line,#444)',borderRadius:'12px'});
 dialog.querySelector('.resource-send').style.cssText='display:grid;gap:12px';
 dialog.querySelector('header').style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px';
 dialog.querySelector('h2').style.margin='0';
 dialog.querySelector('h2').textContent=t('resourceSend.title');
 const close=dialog.querySelector('header [value="cancel"]');close.setAttribute('aria-label',t('common.modal.closeLabel'));close.innerHTML=icon('close');
 dialog.querySelector('footer').style.cssText='display:flex;justify-content:flex-end;gap:8px';
 dialog.querySelector('footer [value="cancel"]').innerHTML=iconText('close',t('common.cancel'));
 dialog.querySelector('[data-send]').innerHTML=iconText('envelope-out',t('resourceSend.action'));
  dialog.querySelector('.resource-send-history summary').textContent=t('resourceSend.history');
 document.body.append(dialog);return dialog;
}
export function bindResourceSend({button,kind,getSource,onDone,onState}){
 if(!button)return;
 button.addEventListener('click',async()=>{
  const source=getSource();if(button.disabled||button.dataset.sendBusy||!source?.id)return;
  button.dataset.sendBusy='1';button.disabled=true;
  try{
   const {data,error}=await sb().rpc('friends_list');if(error)throw error;
   const friends=(data||[]).filter(row=>row.direction==='friend'&&row.status==='active'&&row.user_id);
   const dialog=getDialog(),list=dialog.querySelector('.resource-send-friends'),errorNode=dialog.querySelector('.resource-send-error');
   dialog.querySelector('.resource-send-name').textContent=source.name||'';errorNode.textContent='';
   list.replaceChildren();
   const history=dialog.querySelector('.resource-send-history'),historyList=history.querySelector('div');historyList.replaceChildren();
   const historyResult=await sb().rpc('resource_copy_history',{p_kind:kind,p_source:source.id});
   const historyItems=historyResult.error?[]:historyResult.data?.items||[];
   history.hidden=!historyItems.length;
   for(const item of historyItems){const entry=document.createElement('p');entry.textContent=`${item.recipient_label} · ${new Date(item.sent_at).toLocaleString()}`;historyList.append(entry);}
   if(!friends.length){const empty=document.createElement('p');empty.textContent=t('resourceSend.noFriends');list.append(empty);}
   for(const friend of friends){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=friend.user_id;label.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 2px';label.append(input,document.createTextNode(friend.label||friend.email||''));list.append(label);}
   const submit=dialog.querySelector('[data-send]');submit.disabled=!friends.length;
   submit.onclick=async()=>{
    const ids=[...list.querySelectorAll('input:checked')].map(input=>input.value);if(!ids.length)return;
    submit.disabled=true;errorNode.textContent='';
    try{
     const {data:sessionData,error:sessionError}=await sb().auth.getSession();if(sessionError||!sessionData.session)throw new Error('auth_required');
     for(const recipient_id of ids){
      const key=`${sessionData.session.user.id}:${kind}:${source.id}:${recipient_id}`;
      if(!attempts.has(key))attempts.set(key,crypto.randomUUID());
      const response=await fetch('/_api/resource-send',{method:'POST',headers:{Authorization:`Bearer ${sessionData.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({kind,source_id:source.id,recipient_id,request_id:attempts.get(key),language:getUiLang()})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'copy_failed');attempts.delete(key);
      const recipientEmail=result.mail_to||friends.find(row=>row.user_id===recipient_id)?.email;
      if(result.mail_allowed&&result.go_token&&recipientEmail){
       try{const sent=await sendResourceCopyMail({to:recipientEmail,link:`/go/?c=${encodeURIComponent(result.go_token)}`,ownerLabel:sessionData.session.user.user_metadata?.username||sessionData.session.user.email||'Familiada',name:source.name||'',kind,ownerId:sessionData.session.user.id,recipientId:recipient_id,sourceId:source.id});if(!sent)throw new Error('mail_not_sent');}
       catch(mailError){console.warn('[resource-copy-mail] email delivery failed:',mailError);toast(t('resourceSend.mailFailed'),{kind:'error'});}
      }
     }
     dialog.close();toast(t('resourceSend.sent',{count:ids.length}));await onDone?.();
    }catch(error){errorNode.textContent=t(`resourceSend.errors.${error.message}`)||t('resourceSend.errors.failed');}
    finally{submit.disabled=false;onState?.();}
   };
   if(!dialog.open)dialog.showModal();
  }catch(error){toast(t('resourceSend.errors.failed'),{kind:'error'});console.warn('[resource-send]',error);}
  finally{delete button.dataset.sendBusy;button.disabled=false;onState?.();}
 });
}
