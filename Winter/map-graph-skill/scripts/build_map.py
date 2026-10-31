#!/usr/bin/env python3
"""Build canonical topology from a fully labeled RGB mask. No speculative connections."""
import argparse, hashlib, json, re
from pathlib import Path
from collections import defaultdict
from PIL import Image
import numpy as np
from rasterio.features import shapes
from shapely.geometry import shape, Point
from shapely.ops import unary_union


def save(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')


def issue(issues, code, message, severity='blocking', **kw):
    issues.append(dict(code=code, severity=severity, message=message, **kw))


def valid_id(key):
    return bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', key))


def geom_json(g):
    return g.__geo_interface__


def main():
    ap = argparse.ArgumentParser()
    for x in ('image','mask','regions','rules','out'): ap.add_argument('--'+x, required=True)
    ap.add_argument('--previous'); a=ap.parse_args()
    out=Path(a.out)
    if any((out/name).exists() for name in ('map.candidate.json','review.json')):
        raise SystemExit('STOP: candidate files already exist; use a fresh staging directory')
    out.mkdir(parents=True,exist_ok=True)
    regions=json.loads(Path(a.regions).read_text(encoding='utf-8'))
    rules=json.loads(Path(a.rules).read_text(encoding='utf-8'))
    src=Image.open(a.image).convert('RGB'); mask=Image.open(a.mask).convert('RGB')
    if src.size!=mask.size: raise SystemExit('STOP: image and mask sizes differ; never rescale automatically')
    w,h=src.size; pixels=np.asarray(mask); issues=[]
    rawcode=pixels[:,:,0].astype('int32')*65536+pixels[:,:,1].astype('int32')*256+pixels[:,:,2].astype('int32')
    def rgb(s):
        m=re.fullmatch(r'#([0-9a-fA-F]{6})',s)
        if not m: raise ValueError('Color must be #RRGGBB: '+s)
        return int(m.group(1),16)
    color_defs={rgb(k):v for k,v in regions['colors'].items()}
    backgrounds={rgb(x) for x in regions.get('background',[])}
    seen=set(int(x) for x in np.unique(rawcode))
    for c in sorted(seen-set(color_defs)-backgrounds):
        cnt=int((rawcode==c).sum()); ys,xs=np.where(rawcode==c)
        issue(issues,'UNCLASSIFIED_COLOR',f'#{c:06x} ({cnt} pixels) has no label',bbox=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())])
    # Polygon extraction from one integer label raster; coordinates follow exact pixel cell edges.
    geoms={}; meta={}
    for c,definition in color_defs.items():
        key=definition.get('key');
        if not isinstance(key,str) or not valid_id(key):
            issue(issues,'INVALID_KEY',f'Color #{c:06x}: explicit stable key required');continue
        if key in meta:
            issue(issues,'DUPLICATE_KEY',f'Repeated key {key}'); continue
        if 'type' not in definition or 'active' not in definition or 'decorative' not in definition or 'rewards' not in definition:
            issue(issues,'MISSING_METADATA',f'Missing declared type/status/rewards for {key}');continue
        binary=(rawcode==c).astype('uint8')
        if not binary.any(): issue(issues,'ABSENT_REGION',f'Label {key} absent from mask');continue
        polys=[shape(geom) for geom,val in shapes(binary,mask=binary.astype(bool)) if val==1]
        geom=unary_union(polys)
        geoms[key]=geom;meta[key]=definition
        if geom.area<regions.get('minimumAreaPixels',4): issue(issues,'TINY_REGION',f'{key} is {geom.area:g} pixels',regionIds=[key])
        if geom.geom_type=='MultiPolygon': issue(issues,'DISCONNECTED_REGION',f'{key} has {len(geom.geoms)} disconnected pieces; verify',regionIds=[key])
        if geom.geom_type not in ('Polygon','MultiPolygon') or not geom.is_valid:
            issue(issues,'INVALID_REGION_GEOMETRY',f'{key}: {geom.geom_type}, valid={geom.is_valid}',regionIds=[key])
    previous={}
    if a.previous:
        old=json.loads(Path(a.previous).read_text(encoding='utf-8'))
        for t in old['territories']:
            try: previous[t['id']]=(t,shape(t['geometry']))
            except Exception: issue(issues,'INVALID_OLD_GEOMETRY',f"Cannot read old geometry for {t.get('id')}")
    threshold=float(regions.get('idMatchThreshold',0.85));margin=float(regions.get('idAmbiguityMargin',0.05))
    assigned={}; used=set()
    for key,g in geoms.items():
        matches=[]
        for id,(t,oldg) in previous.items():
            inter=g.intersection(oldg).area; union=g.area+oldg.area-inter
            iou=inter/union if union else 0
            if iou>0: matches.append((iou,id,t))
        matches.sort(reverse=True,key=lambda x:x[0]); viable=[q for q in matches if q[0]>=threshold]
        if viable and (len(viable)==1 or viable[0][0]-viable[1][0]>margin):
            score,id,t=viable[0]
            if t.get('type')!=meta[key]['type'] or bool(t.get('active'))!=bool(meta[key]['active']):
                issue(issues,'ID_TYPE_CONFLICT',f'{key} overlaps former {id} but status/type changed',regionIds=[key]); continue
            if id in used:
                issue(issues,'ID_SPLIT',f'Old ID {id} matches multiple regions',regionIds=[key]);continue
            assigned[key]=id;used.add(id)
        elif viable:
            issue(issues,'ID_AMBIGUITY',f'{key}: multiple previous IDs match',regionIds=[key]);continue
        elif matches and matches[0][0]>=0.15:
            issue(issues,'ID_LOW_OVERLAP',f'{key}: max old IoU {matches[0][0]:.3f}; manual reconciliation',regionIds=[key]);continue
        else:
            assigned[key]=key
    # Check collisions between newly assigned explicit keys and inherited IDs.
    ids=list(assigned.values());
    for id in set(ids):
        if ids.count(id)>1: issue(issues,'ID_DUPLICATE',f'Repeated ID {id}')
    for id in previous:
        if id not in used and id not in assigned.values():
            issue(issues,'OLD_ID_UNMATCHED',f'Old region {id} no longer uniquely matches; confirm removal')
    territory=[]
    for key,g in geoms.items():
        if key not in assigned:continue
        p=g.representative_point();d=meta[key]
        territory.append({'id':assigned[key], 'key':key,'type':d['type'],'active':bool(d['active']),
                          'decorative':bool(d['decorative']),'rewards':d['rewards'],
                          'center':{'x':p.x,'y':p.y}, 'geometry':geom_json(g)})
    # Exact geometry adjacency: shared boundary length > threshold, corner touching ignored.
    adj=[]; keys=list(geoms)
    for ix,ka in enumerate(keys):
        for kb in keys[ix+1:]:
            length=geoms[ka].boundary.intersection(geoms[kb].boundary).length
            if length>=float(rules.get('minimumSharedBorder',1)) and length>0:
                adj.append({'a':assigned.get(ka,ka),'b':assigned.get(kb,kb),'borderLength':round(length,6)})
    pairs={frozenset([v['a'],v['b']]) for v in adj}
    connections=[]
    for raw in rules.get('passages',[]):
        ka,kb=raw.get('from'),raw.get('to')
        if ka not in geoms or kb not in geoms or ka not in assigned or kb not in assigned:
            issue(issues,'PASSAGE_ENDPOINT',f'Rule passage {ka} -> {kb} missing/unresolved');continue
        if not(meta[ka]['active'] and meta[kb]['active']) or meta[ka]['decorative'] or meta[kb]['decorative']:
            issue(issues,'INACTIVE_PASSAGE',f'Passage {ka} -> {kb} touches inactive/decorative area');continue
        kind=raw.get('kind','passage')
        if kind not in ('passage','portal'):
            issue(issues,'UNSUPPORTED_PASSAGE_KIND',f'Passage {ka} -> {kb} unsupported kind {kind}');continue
        if kind=='passage' and frozenset((assigned[ka],assigned[kb])) not in pairs:
            issue(issues,'NONADJACENT_PASSAGE',f'Passage {ka} -> {kb} has no shared border');continue
        connections.append({'id':raw.get('id',f'{assigned[ka]}--{assigned[kb]}'), 'from':assigned[ka], 'to':assigned[kb], 'kind':kind, 'directed':bool(raw.get('directed',False))})
    # Unapproved adjacency is a review target rather than a guessed passage.
    confirmed={frozenset((x['from'],x['to'])) for x in connections}
    for a0 in adj:
        p=frozenset((a0['a'],a0['b']))
        if p not in confirmed and all(any(t['id']==pid and t['active'] and not t['decorative'] for t in territory) for pid in p):
            issue(issues,'UNRESOLVED_BORDER',f"Shared border {a0['a']} / {a0['b']}: passage or barrier?",regionIds=[a0['a'],a0['b']])
    encoded=Path(a.image).read_bytes();data={'schemaVersion':'1.0-candidate',
        'image':{'src':Path(a.image).name,'width':w,'height':h,'sha256':hashlib.sha256(encoded).hexdigest()},
        'territories':territory, 'adjacencies':adj,'connections':connections,
        'reviewRequired':any(i['severity']=='blocking' for i in issues),
        'metadata':{'coordinateSystem':'image-pixels-top-left','projectSchemaAdapted':False,'requireConnected':bool(rules.get('requireConnected',True)), 'allowIsolatedActive':rules.get('allowIsolatedActive',[])}}
    save(out/'map.candidate.json',data);save(out/'review.json',{'issues':issues,'blockingCount':sum(i['severity']=='blocking' for i in issues)})
    print('Wrote candidate:',out,'territories=',len(territory),'blocking=',sum(i['severity']=='blocking' for i in issues))

if __name__=='__main__':main()
