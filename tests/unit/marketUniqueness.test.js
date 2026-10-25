import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { uniquenessSummary, uniquenessReportHtml, exactCopy } from '../../web/admin/js/uniqueness.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const source = fs.readFileSync(new URL('../../supabase/functions/generate-game/uniqueness.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
const unit = () => { const v=Array(384).fill(0);v[0]=1;return v; };
function moduleWith(fetchImpl) {
 const context={module:{exports:{}},fetch:fetchImpl,AbortSignal,Response,Error,Date,setTimeout};
 vm.createContext(context);vm.runInContext(code,context);return context.module.exports;
}
const settings = key => ({ MARKET_SEMANTIC_URL:'http://model.test', GENERATE_GAME_SECRET:'fixture-token' }[key]);

test('wektor: długość, liczby skończone i dodatnia norma są wymagane', () => {
 const m=moduleWith();
 for(const vector of [[],Array(384).fill(0),Array(384).fill(NaN),Array(384).fill('1')]) assert.throws(()=>m.normalizedVector(vector));
 assert.equal(m.normalizedVector(unit())[0],1);
});

test('model: partie 32, tożsamość modelu, liczba odpowiedzi i sekret serwera', async () => {
 const batches=[];
 const m=moduleWith(async(url,opts)=>{const body=JSON.parse(opts.body);batches.push(body.texts.length);assert.equal(opts.headers['X-Internal-Secret'],'fixture-token');return Response.json({model:'paraphrase-multilingual-minilm-l12-v2-qa-v1',vectors:body.texts.map(()=>unit())});});
 const result=await m.embedQuestions(Array.from({length:33},(_,i)=>({question_pos:i+1,text:'Question '+i})),settings);
 assert.equal(result.length,33);assert.deepEqual(batches,[32,1]);assert.equal(result[32].question_pos,33);
 const bad=moduleWith(async()=>Response.json({model:'another-model',vectors:[unit()]}));
 await assert.rejects(bad.embedQuestions([{question_pos:1,text:'q'}],settings),/invalid_semantic_response/);
});

test('model zajęty przez inną kontrolę: ograniczone ponowienie', async () => {
 let requests=0;
 const m=moduleWith(async()=>++requests===1?new Response('{}',{status:429}):Response.json({ok:true,model:'paraphrase-multilingual-minilm-l12-v2-qa-v1',vectors:[unit()]}));
 const vectors=await m.embedQuestions([{question_pos:1,text:'q'}],settings);assert.equal(requests,2);assert.equal(vectors.length,1);
});

test('brak modelu: raport dokładny i tekstowy nadal wykonany, brak fałszywej kompletności', async () => {
 const calls=[];const m=moduleWith();
 const client={rpc:async(name)=>{calls.push(name);return {data:name==='market_embedding_jobs'?[{game_id:'g'}]:{ok:true,matches:[],semantic:{complete:false,source_indexed:0}},error:null};}};
 const report=await m.checkGameUniqueness(client,()=>undefined,{id:'g'});
 assert.ok(calls.includes('market_uniqueness_report'));assert.equal(report.semantic.status,'unavailable');assert.equal(report.semantic.complete,false);
});

test('gotowe wektory: dostępność usługi nie jest wymagana do ich porównania', async () => {
 const m=moduleWith();const result=await m.indexSemanticQuestions({rpc:async()=>({data:[],error:null})},()=>undefined);
 assert.equal(result.ok,true);assert.equal(result.complete,true);
});

test('spóźniona odpowiedź nie nadpisuje zmienionej gry', async () => {
 const m=moduleWith(async()=>Response.json({model:'paraphrase-multilingual-minilm-l12-v2-qa-v1',vectors:[unit()]}));
 const client={rpc:async name=>({data:name==='market_embedding_jobs'?[{game_id:'g',revision:'old',questions:[{question_pos:1,text:'old question'}]}]:{ok:false,error:'stale_revision'},error:null})};
 const result=await m.indexSemanticQuestions(client,settings);assert.equal(result.ok,false);assert.equal(result.error,'stale_revision');assert.equal(result.processed,0);
});

test('błąd bazowego porównania jest błędem, a nie pustą listą kopii', async () => {
 const m=moduleWith();const client={rpc:async name=>name==='market_embedding_jobs'?{data:[],error:null}:{data:null,error:{message:'down'}}};
 await assert.rejects(m.checkGameUniqueness(client,()=>undefined,{id:'g'}),/market_uniqueness_report_failed/);
});

test('panel rozróżnia niepełny wynik i dokładną kopię oraz ucieka treści pytań', () => {
 const partial={ok:true,matches:[],semantic:{complete:false,status:'unavailable',corpus_indexed:0,corpus_total:20}};
 assert.match(uniquenessSummary(partial),/niepełne/);assert.match(uniquenessReportHtml(partial),/niedostępne/);
 const copy={...partial,question_count:10,matches:[{title:'<img src=x>',lang:'pl',exact_content:true,matched_questions:10,question_pairs:[{source_pos:1,candidate_pos:2,source_text:'<script>bad()</script>',candidate_text:'& q',method:'semantic'}]}]};
 assert.equal(exactCopy(copy),true);const html=uniquenessReportHtml(copy);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('zbliżone znaczenie'));
});
