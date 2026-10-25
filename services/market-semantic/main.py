"""Private CPU embedding service. Does not store or log questions."""
import hmac, json, math, os, pathlib, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from model_spec import MODEL_ID, MODEL_NAME, MODEL_REVISION
MAX_BODY=196608
MAX_BATCH=32
MAX_TEXT=1024

class Embedder:
    def __init__(self, directory, threads=1):
        import onnxruntime
        onnxruntime.disable_telemetry_events()
        from fastembed import TextEmbedding
        directory=pathlib.Path(directory)
        manifest=json.loads((directory/'manifest.json').read_text())
        if manifest.get('model')!=MODEL_ID or manifest.get('revision')!=MODEL_REVISION:
            raise RuntimeError('Wrong model revision')
        self.model=TextEmbedding(model_name=MODEL_NAME,specific_model_path=directory,threads=threads,local_files_only=True)
    def __call__(self,texts):
        return [v.tolist() for v in self.model.embed(texts,batch_size=8)]

def handler_for(embedder, secret):
    if not secret: raise RuntimeError('SEMANTIC_TOKEN must be set')
    capacity=threading.BoundedSemaphore(1)
    class Handler(BaseHTTPRequestHandler):
        server_version='MarketSemantic'
        def setup(self):
            super().setup();self.connection.settimeout(10)
        def log_message(self, *_args): pass
        def reply(self,code,body):
            payload=json.dumps(body,allow_nan=False).encode()
            self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def do_GET(self):
            if self.path=='/health':self.reply(200,{'ok':True,'model':MODEL_ID})
            else:self.reply(404,{'ok':False,'error':'not_found'})
        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('X-Internal-Secret','').encode(),secret.encode()):
                self.reply(401,{'ok':False,'error':'unauthorized'});return
            if self.path!='/embed':self.reply(404,{'ok':False,'error':'not_found'});return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_BODY:raise ValueError()
                if self.headers.get('Transfer-Encoding'):raise ValueError()
                body=json.loads(self.rfile.read(length));texts=body.get('texts')
                if body.get('model')!=MODEL_ID or not isinstance(texts,list) or not 1<=len(texts)<=MAX_BATCH:raise ValueError()
                if any(not isinstance(text,str) or not text.strip() or len(text)>MAX_TEXT for text in texts):raise ValueError()
            except (ValueError,TypeError,AttributeError,UnicodeError):
                self.reply(400,{'ok':False,'error':'invalid_request'});return
            if not capacity.acquire(blocking=False):
                self.reply(429,{'ok':False,'error':'busy'});return
            try:
                vectors=embedder(texts)
                if len(vectors)!=len(texts) or any(len(v)!=384 or any(not isinstance(n,(int,float)) or not math.isfinite(n) for n in v) or sum(n*n for n in v)<=1e-20 for v in vectors):raise ValueError('invalid_vector')
                self.reply(200,{'ok':True,'model':MODEL_ID,'vectors':vectors})
            except Exception:
                self.reply(503,{'ok':False,'error':'model_unavailable'})
            finally:capacity.release()
    return Handler

if __name__=='__main__':
    secret=os.environ.get('SEMANTIC_TOKEN','')
    if not secret:raise RuntimeError('SEMANTIC_TOKEN must be set')
    model=Embedder(os.environ.get('MODEL_PATH','/opt/model'),max(1,min(2,int(os.environ.get('MODEL_THREADS','1')))))
    ThreadingHTTPServer(('0.0.0.0',8090),handler_for(model,secret)).serve_forever()
