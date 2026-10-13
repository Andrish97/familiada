import {sb} from './supabase.js?v=v2026-10-13T13553';
import {t} from '../../translation/translation.js?v=v2026-10-13T13553';

export async function refreshResourceCopyInbox({kind,variant,host,onChanged}){
 if(!host)return;
 await refreshResourceCopyBadges();
 const {data,error}=await sb().rpc('resource_copy_inbox',{p_kind:kind});
 if(error||data?.ok!==true){host.hidden=true;return;}
 const logoVariant={TEXT:'GLYPH_30x10',DRAW:'PIX_150x70',IMAGE:'PIX_150x70'}[variant];
 const items=(data.items||[]).filter(item=>!variant||(kind==='logo'?item.variant===logoVariant&&item.logo_mode===(variant==='TEXT'?'TEXT':variant):item.variant===variant));host.replaceChildren();host.hidden=!items.length;
 if(!items.length)return;
 const title=document.createElement('h3');title.textContent=t('resourceSend.received');host.append(title);
 for(const item of items){
  const row=document.createElement('div');row.className='resource-copy-inbox-row';
  const name=document.createElement('strong');name.textContent=item.name;
  const from=document.createElement('span');from.textContent=t('resourceSend.from',{name:item.sender_label});
  const actions=document.createElement('div');actions.className='resource-copy-inbox-actions';
  const errorNode=document.createElement('span');errorNode.className='resource-copy-inbox-error';errorNode.setAttribute('role','status');
  const accept=document.createElement('button');accept.type='button';accept.className='btn sm gold';accept.textContent=t('resourceSend.accept');
  const decline=document.createElement('button');decline.type='button';decline.className='btn sm';decline.textContent=t('resourceSend.decline');
  const decide=async(decision,button)=>{
   if(button.disabled)return;accept.disabled=decline.disabled=true;
   try{
    const result=await sb().rpc('resource_copy_decide',{p_offer:item.id,p_decision:decision});
    if(result.error||result.data?.ok!==true){errorNode.textContent=t('resourceSend.errors.decisionFailed');accept.disabled=decline.disabled=false;return;}
    await onChanged?.();
   }catch{errorNode.textContent=t('resourceSend.errors.decisionFailed');accept.disabled=decline.disabled=false;}
  };
  accept.addEventListener('click',()=>void decide('accept',accept));
  decline.addEventListener('click',()=>void decide('decline',decline));
  actions.append(accept,decline);row.append(name,from,actions,errorNode);host.append(row);
 }
}

export async function refreshResourceCopyBadges(){
 const slots=[...document.querySelectorAll('[data-copy-kind][data-copy-variant]')];if(!slots.length)return;
 try{
  const {data,error}=await sb().rpc('resource_copy_badges');if(error||data?.ok!==true)throw error||new Error('badge_load_failed');
  const counts=data.items||[];
  const total=kind=>counts.filter(item=>item.kind===kind).reduce((sum,item)=>sum+Number(item.count||0),0);
  for(const slot of slots){
   const n=counts.filter(item=>item.kind===slot.dataset.copyKind&&item.variant===slot.dataset.copyVariant&&(!slot.dataset.copyMode||item.mode===slot.dataset.copyMode)).reduce((sum,item)=>sum+Number(item.count||0),0);
   slot.dataset.copyCount=n?String(n>99?99:n):'';
  }
  const pageKind=location.pathname.startsWith('/logo/')?'logo':'game';
  const navBadge=document.getElementById(pageKind==='logo'?'gamesCopiesNavBadge':'logoCopiesNavBadge');
  if(navBadge)navBadge.textContent=total(pageKind==='logo'?'game':'logo')>99?'99+':String(total(pageKind==='logo'?'game':'logo')||'');
 }catch{
  for(const slot of slots)slot.dataset.copyCount='';
  for(const id of ['gamesCopiesNavBadge','logoCopiesNavBadge']){const badge=document.getElementById(id);if(badge)badge.textContent='';}
 }
}
