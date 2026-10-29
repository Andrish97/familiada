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
// Zrzuty ekranu (dane demo, scripts/screens/: strona główna, Wskazówki) mają
// identyfikatory 00000000-0000-4000-8000-…, których baza nigdy nie nadaje.
// Każdy kod QR z kadru -- ankieta, urządzenie, QR na Wyświetlaczu -- prowadzi
// przez /go/ do ukrytej gry w węża (/snake/).
export function isScreenshotId(id){
 return /^00000000-0000-4000-8000-[0-9a-f]{12}$/i.test(String(id||''));
}
// Adres węża dla linku /go/ z kadru (null: zwykły link). lang -- język strony
// (i18n zdejmuje ?lang= z adresu przy starcie, więc nie z params).
export function screenshotSnakeUrl(params,base,lang=null){
 const id=params.get('id');
 if(!isScreenshotId(id))return null;
 const url=new URL('/snake/',base);url.searchParams.set('qr',id);
 if(['pl','en','uk'].includes(lang))url.searchParams.set('lang',lang);
 return url.toString();
}
