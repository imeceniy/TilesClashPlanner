#!/usr/bin/env python3
"""Strict, independently rerunnable validator of canonical map JSON."""
import argparse,json,sys
from pathlib import Path
from collections import defaultdict,Counter
from shapely.geometry import shape,Point,box
from shapely.ops import unary_union

def validate(d):
    errors=[]; warnings=[]
    def err(code,info):errors.append({'code':code,'message':info})
    def warn(code,info):warnings.append({'code':code,'message':info})
    try:w=int(d['image']['width']);h=int(d['image']['height'])
    except Exception: return {'errors':[{'code':'IMAGE','message':'Missing image width/height'}], 'warnings':[]}
    if w<=0 or h<=0:err('IMAGE_SIZE','Invalid image dimensions')
    byid={};geoms={};bounds=box(0,0,w,h)
    for t in d.get('territories',[]):
        id=t.get('id')
        if id in byid:err('DUPLICATE_ID',repr(id))
        byid[id]=t
        try:
            g=shape(t['geometry']);geoms[id]=g
            if g.geom_type not in ('Polygon','MultiPolygon') or g.is_empty or not g.is_valid or g.area<=0:err('INVALID_POLYGON',repr(id))
            if g.difference(bounds).area>1e-8:err('OUT_OF_BOUNDS',repr(id))
            cp=t['center'];point=Point(cp['x'],cp['y'])
            if not g.covers(point):err('CENTER_OUTSIDE',repr(id))
        except Exception as ex:err('MALFORMED_TERRITORY',f'{id}: {ex}')
        if t.get('decorative') and t.get('active'):err('DECORATIVE_ACTIVE',repr(id))
    keys=[t.get('key') for t in d.get('territories',[])]
    for key,num in Counter(keys).items():
        if num>1:err('DUPLICATE_KEY',repr(key))
    ids=list(geoms)
    # spatial index via shapely STRtree handles larger maps efficiently
    from shapely.strtree import STRtree
    gs=[geoms[id] for id in ids]
    if gs:
        tree=STRtree(gs)
        for i,g in enumerate(gs):
            for j in tree.query(g):
                j=int(j)
                if j<=i:continue
                inter=g.intersection(gs[j])
                if inter.area>1e-7:err('POLYGON_OVERLAP',f'{ids[i]} & {ids[j]} overlap {inter.area:.6g} px²')
    # Gaps cannot be interpreted without an explicit authoritative land coverage mask.
    if d.get('coverageGeometry'):
        try:
            coverage=shape(d['coverageGeometry']); union=unary_union(gs)
            missing=coverage.difference(union).area
            if missing>1e-7:err('COVERAGE_GAP',f'{missing:.6g} px² uncovered')
        except Exception as ex:err('BAD_COVERAGE',str(ex))
    else:warn('COVERAGE_UNVERIFIED','No authoritative coverageGeometry; cannot certify absence of gaps vs intentional background')
    pairset=set()
    for a in d.get('adjacencies',[]):
        x,y=a.get('a'),a.get('b')
        pair=frozenset((x,y))
        if x not in byid or y not in byid or x==y:err('ADJ_ENDPOINT',f'{x} / {y}')
        if pair in pairset:err('DUP_ADJ',f'{x} / {y}')
        pairset.add(pair)
        if x in geoms and y in geoms:
            length=geoms[x].boundary.intersection(geoms[y].boundary).length
            if length<=0:err('FALSE_ADJACENCY',f'{x} / {y}')
            if abs(length-float(a.get('borderLength',0)))>0.001:err('BORDER_LENGTH_MISMATCH',f'{x} / {y}: {length}')
    ids_conn=set(); pairs=set(); graph=defaultdict(set)
    for e in d.get('connections',[]):
        eid=e.get('id');x,y=e.get('from'),e.get('to');directed=bool(e.get('directed',False))
        if eid in ids_conn:err('DUPLICATE_CONNECTION_ID',repr(eid))
        ids_conn.add(eid)
        pk=(x,y) if directed else tuple(sorted([str(x),str(y)]))
        if pk in pairs:err('DUPLICATE_CONNECTION',f'{x} / {y}')
        pairs.add(pk)
        if x==y or x not in byid or y not in byid:err('CONNECTION_ENDPOINT',f'{x} / {y}');continue
        if not(byid[x].get('active') and byid[y].get('active')) or byid[x].get('decorative') or byid[y].get('decorative'):
            err('INACTIVE_EDGE',f'{x} / {y}')
        if e.get('kind')=='passage' and frozenset((x,y)) not in pairset:err('PASSAGE_NOT_ADJACENT',f'{x} / {y}')
        graph[x].add(y);graph[y].add(x) # weak connectivity for directed routes
    active={id for id,t in byid.items() if t.get('active') and not t.get('decorative')}
    visited=set();components=[]
    for start in sorted(active,key=str):
        if start in visited:continue
        comp=[];todo=[start]
        while todo:
            x=todo.pop()
            if x in visited:continue
            visited.add(x);comp.append(x);todo.extend(graph[x] & active - visited)
        components.append(sorted(comp,key=str))
    if len(components)>1:
        f=err if d.get('metadata',{}).get('requireConnected',True) else warn
        f('DISCONNECTED_GRAPH',f'{len(components)} active components: {components}')
    if d.get('reviewRequired'):err('REVIEW_REQUIRED','Unresolved blocking review issues')
    if not d.get('metadata',{}).get('projectSchemaAdapted',False):warn('NOT_PROJECT_ADAPTED','Canonical candidate is not typed against the actual React TypeScript project interfaces')
    return {'errors':errors,'warnings':warnings,'components':components,'ok':not errors}

def main():
    p=argparse.ArgumentParser();p.add_argument('map');p.add_argument('--report');args=p.parse_args()
    result=validate(json.loads(Path(args.map).read_text(encoding='utf-8')))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if args.report:Path(args.report).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    sys.exit(0 if result['ok'] else 1)
if __name__=='__main__':main()
