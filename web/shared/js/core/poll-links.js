// Public anonymous links contain no recipient identity or invitation token.
const votePaths={poll_text:'/polls/vote/text/',poll_points:'/polls/vote/points/'};
export function anonymousPollLink({gameId,key,lang},base){
 const url=new URL('/go/',base);
 url.searchParams.set('p','anon');url.searchParams.set('id',gameId);url.searchParams.set('key',key);
 if(['pl','en','uk'].includes(lang))url.searchParams.set('lang',lang);
 return url.toString();
}
export function anonymousPollDestination({state,type,gameId,key,lang},base){
 if(state!=='open'||!votePaths[type])return null;
 const url=new URL(votePaths[type],base);url.searchParams.set('id',gameId);url.searchParams.set('key',key);
 if(['pl','en','uk'].includes(lang))url.searchParams.set('lang',lang);
 return url.toString();
}
export function validAnonymousPollParams(params){
 return params.get('p')==='anon'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.get('id')||'')&&Boolean(params.get('key'))
  && !['d','t','s','f','b','u','m','action'].some(key=>params.has(key))
  && ['p','id','key','lang'].every(key=>params.getAll(key).length<=1);
}
