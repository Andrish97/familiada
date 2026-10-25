import {readFileSync} from 'node:fs';
export const gameId='11111111-1111-4111-8111-111111111111';
export const row={id:gameId,slug:'dzieci-i-rodzice',title:'Dzieci i rodzice',description:'Pytania dla całej rodziny',lang:'pl',origin:'community',author_username:'Autor publiczny',library_count:7,avg_rating:4.5,rating_count:4,created_at:'2026-10-20T12:00:00Z'};
export const detail={...row,status:'published',in_library:true,user_stars:5,author_email:'PRIVATE_EMAIL',moderation_note:'PRIVATE_NOTE',payload:{questions:[{text:'Pytanie <script>alert(1)</script>',answers:[{text:'Odpowiedź </script><script>bad()</script>',fixed_points:20,ord:1}],private_note:'PRIVATE_PAYLOAD'}]}};
export function fixtureOrigin(state,requests=[]) {
  return async (request)=>{
    const url=new URL(request.url);
    requests.push({path:url.pathname,authorization:request.headers.get('Authorization'),cookie:request.headers.get('Cookie')});
    if(url.pathname.startsWith('/rest/v1/')){
      if(state.fail) return new Response('unavailable',{status:503});
      if(url.pathname.endsWith('/market_public_catalog')) return Response.json(state.rows ?? [row]);
      if(url.pathname.endsWith('/market_game_by_slug')||url.pathname.endsWith('/market_game_detail')) {
        const body=await request.json();
        return Response.json(state.withdrawn || (body.p_slug && body.p_slug!==row.slug) || (body.p_id && body.p_id!==gameId)?[]:[state.game??detail]);
      }
      throw new Error('unexpected public API path: '+url.pathname);
    }
    const source={'/marketplace/index.html':'marketplace/index.html','/404.html':'404.html','/maintenance/index.html':'maintenance/index.html'}[url.pathname];
    if(!source||state.originFail) return new Response('not found',{status:404});
    return new Response(readFileSync(new URL('../../../web/'+source,import.meta.url)),{headers:{'Content-Type':'text/html'}});
  };
}
