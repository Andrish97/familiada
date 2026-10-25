"""Offline test of the actual pinned model. Prints only numeric summaries."""
import argparse,json,pathlib,time,resource
import numpy as np
from main import Embedder
parser=argparse.ArgumentParser();parser.add_argument('--model',required=True);parser.add_argument('--public-games');parser.add_argument('--output');parser.add_argument('--fixture-games');parser.add_argument('--fixture-vectors');args=parser.parse_args()
model=Embedder(args.model)
fixture=json.loads((pathlib.Path(__file__).parent/'quality-fixture.json').read_text())
answers=json.loads((pathlib.Path(__file__).parent/'quality-answers.json').read_text())
fixture_games=[];fixture_vectors=[]
measurements=[]
for lang,pairs in fixture.items():
 texts=[t+'\n'+'\n'.join(sorted(answers[lang][i])) for i,pair in enumerate(pairs) for t in pair]
 vectors=np.asarray(model(texts));vectors=vectors/np.linalg.norm(vectors,axis=1,keepdims=True)
 if args.fixture_games:
  import uuid
  for side in [0,1]:
   fixture_games.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'market-quality:'+lang+':'+str(side))),'title':'Kontrola parafraz '+lang+' '+str(side),'lang':lang,'payload':{'questions':[{'text':pair[side],'answers':[{'text':answer,'fixed_points':30} for answer in answers[lang][i]]} for i,pair in enumerate(pairs)]}})
   fixture_vectors.extend(vectors[2*i+side] for i in range(len(pairs)))

 positive=[float(vectors[2*i]@vectors[2*i+1]) for i in range(len(pairs))]
 negative=[float(vectors[2*i]@vectors[2*((i+3)%len(pairs))]) for i in range(len(pairs))]
 measurements.append({'lang':lang,'positive_scores':[round(x,3) for x in positive],'negative_scores':[round(x,3) for x in negative],
   'thresholds':{str(t):{'found':sum(x>=t for x in positive),'negative_flagged':sum(x>=t for x in negative)} for t in [.65,.7,.72,.75,.8,.88]}})
result={'fixture_pairs':sum(len(v) for v in fixture.values()),'measurements':measurements}
if args.fixture_games:
 pathlib.Path(args.fixture_games).write_text(json.dumps(fixture_games,ensure_ascii=False))
 np.save(args.fixture_vectors,np.asarray(fixture_vectors))
if args.public_games:
 games=json.loads(pathlib.Path(args.public_games).read_text());texts=[];owners=[];langs=[]
 for g in games:
  for q in g['payload']['questions']:texts.append(q['text'].strip()+'\n'+'\n'.join(sorted(a['text'].strip().lower() for a in q['answers'])));owners.append(g['id']);langs.append(g['lang'])
 t=time.monotonic();vectors=[]
 for i in range(0,len(texts),32):vectors.extend(model(texts[i:i+32]))
 vectors=np.asarray(vectors);vectors=vectors/np.linalg.norm(vectors,axis=1,keepdims=True)
 if args.output:np.save(args.output,vectors)
 similarities=vectors@vectors.T
 counts={str(threshold):int(sum(similarities[i,j]>=threshold for i in range(len(texts)) for j in range(i+1,len(texts)) if owners[i]!=owners[j] and langs[i]==langs[j])) for threshold in [.65,.7,.72,.75,.8,.88]}
 result['public_corpus']={'questions':len(texts),'seconds':round(time.monotonic()-t,2),'question_pairs_by_threshold':counts}
result['peak_rss_mb']=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1)
print(json.dumps(result))
