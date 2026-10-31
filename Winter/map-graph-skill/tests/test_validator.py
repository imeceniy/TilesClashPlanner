import sys,unittest,copy,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from validate_map import validate

class ValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.good=json.loads((Path(__file__).parents[1]/'examples/generated/map.candidate.json').read_text())
    def test_good(self):self.assertTrue(validate(self.good)['ok'])
    def test_duplicate_id(self):
        d=copy.deepcopy(self.good);d['territories'][1]['id']=d['territories'][0]['id']
        self.assertIn('DUPLICATE_ID',[x['code'] for x in validate(d)['errors']])
    def test_duplicate_edge(self):
        d=copy.deepcopy(self.good);d['connections'].append(copy.deepcopy(d['connections'][0]))
        codes=[x['code'] for x in validate(d)['errors']]
        self.assertIn('DUPLICATE_CONNECTION',codes)
    def test_unknown_endpoint(self):
        d=copy.deepcopy(self.good);d['connections'][0]['to']='absent'
        self.assertIn('CONNECTION_ENDPOINT',[x['code'] for x in validate(d)['errors']])
    def test_overlap(self):
        d=copy.deepcopy(self.good);d['territories'][1]['geometry']=copy.deepcopy(d['territories'][0]['geometry'])
        self.assertIn('POLYGON_OVERLAP',[x['code'] for x in validate(d)['errors']])
    def test_disconnected(self):
        d=copy.deepcopy(self.good);d['connections']=[]
        self.assertIn('DISCONNECTED_GRAPH',[x['code'] for x in validate(d)['errors']])
    def test_inactive_edge(self):
        d=copy.deepcopy(self.good);d['territories'][0]['active']=False
        self.assertIn('INACTIVE_EDGE',[x['code'] for x in validate(d)['errors']])
if __name__=='__main__':unittest.main()
