const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const kinds={ 'friend:invite':['friend','f'],'friend:resend':['friend','f'],
 'poll:invite':['subscription','s'],'poll:resend':['subscription','s'],
 'poll:share':['poll','t'],'base:share':['base','b'],'device:share':['device','key'] };

// This only reads a current outgoing document's canonical action reference.
// Authority comes from the private allocation minted by the budget-checked RPC;
// historical queue rows are never bound from their body or a guessed relation.
export function notificationReference(html, action) {
 const spec=kinds[action];if(!spec)throw new Error('invalid_notification_action');
 const found=new Map();
 for(const match of String(html).matchAll(/<a(?=\s|>)(?:"[^"]*"|'[^']*'|[^'">])*?>/gi)) {
  const attrs=match[0].slice(2,-1);let href;
  for(const attr of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g))if(attr[1].toLowerCase()==='href')href=attr[2]??attr[3]??attr[4];
  if(!href)continue;
  let url;try{url=new URL(href.replace(/&(?:amp|#38|#x26);/gi,'&'));}catch{continue;}
  if(url.protocol!=='https:'||!['www.familiada.online','familiada.online'].includes(url.hostname)||url.port||url.username||url.password||!['/go','/go/','/go/index.html'].includes(url.pathname))continue;
  if(url.searchParams.has('action'))continue;
  const values=url.searchParams.getAll(spec[1]);if(!values.length)continue;
  if(values.length!==1||!UUID.test(values[0]))throw new Error('invalid_notification_reference');
  const reference={kind:spec[0],token:values[0].toLowerCase()};
  if(reference.kind==='device'){
   const type=url.searchParams.getAll('d'),game=url.searchParams.getAll('id');
   if(type.length!==1||!['display','host','buzzer'].includes(type[0])||game.length!==1||!UUID.test(game[0]))throw new Error('invalid_notification_reference');
   reference.device_type=type[0];reference.game_id=game[0].toLowerCase();
  }
  found.set(JSON.stringify(reference),reference);
 }
 if(found.size!==1)throw new Error('ambiguous_notification_reference');
 return [...found.values()][0];
}
