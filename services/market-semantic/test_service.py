import http.client,json,threading,unittest
from http.server import ThreadingHTTPServer
from main import handler_for
from model_spec import MODEL_ID

def vector():return [1.0]+[0.0]*383
class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        def embed(texts):self.calls.append(texts);return [vector() for _ in texts]
        self.server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(embed,'test-token'))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join()
    def request(self,path='/embed',body=None,token='test-token',method='POST'):
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        connection.request(method,path,body=json.dumps(body if body is not None else {'model':MODEL_ID,'texts':['Pytanie testowe?']}).encode(),headers={'X-Internal-Secret':token,'Content-Type':'application/json'})
        response=connection.getresponse();data=json.loads(response.read());status=response.status;connection.close();return status,data
    def test_auth_before_inference(self):
        self.assertEqual(self.request(token='wrong')[0],401);self.assertEqual(self.calls,[])
    def test_model_and_dimension(self):
        status,data=self.request();self.assertEqual(status,200);self.assertEqual(data['model'],MODEL_ID);self.assertEqual(len(data['vectors'][0]),384)
    def test_input_bounds(self):
        for body in [{'model':MODEL_ID,'texts':[]},{'model':MODEL_ID,'texts':['x']*33},{'model':MODEL_ID,'texts':['x'*1025]},{'model':'wrong','texts':['x']},{'model':MODEL_ID,'texts':[3]}]:self.assertEqual(self.request(body=body)[0],400)
        self.assertEqual(self.calls,[])
    def test_health_does_not_run_inference(self):
        self.assertEqual(self.request(path='/health',method='GET')[0],200);self.assertEqual(self.calls,[])
    def test_unsupported_route(self):self.assertEqual(self.request(path='/unknown')[0],404)

if __name__=='__main__':unittest.main()
