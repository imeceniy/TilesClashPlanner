#!/usr/bin/env python3
"""Extract separate cells from Winter's color-by-type mask and stable ID reference."""
import json, hashlib
from collections import Counter
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon

ROOT=Path(__file__).resolve().parents[2]
MASK=ROOT/'Masked.png'; REF=ROOT/'ID map.jpg'; SCHEMA=ROOT/'photo_2026-10-31_15-12-53.jpg'
OUT=ROOT/'generated'
PALETTE={
 (136,0,21):('bastion',1,24),(255,127,39):('bastion',2,20),(34,177,76):('bastion',3,16),(0,162,232):('bastion',4,12),(163,73,164):('bastion',5,8),(237,28,36):('bastion',6,4),
 (185,122,87):('gasBase',1,24),(255,201,14):('gasBase',2,20),(181,230,29):('gasBase',3,16),(153,217,234):('gasBase',4,12),(200,191,231):('gasBase',5,8),(255,174,201):('gasBase',6,4)}

def main():
    OUT.mkdir(exist_ok=True)
    mask=np.array(Image.open(MASK).convert('RGB'))
    if mask.shape[:2] != (1280,1280): raise ValueError(f'Unexpected mask dimensions: {mask.shape}')
    H=cv2.getPerspectiveTransform(np.float32([[628,115],[1025,512],[628,906],[235,512]]),np.float32([[632,14],[1264,640],[643,1265],[10,640]]))
    ref=cv2.imread(str(REF)); aligned=cv2.warpPerspective(ref,H,(1280,1280))
    overlay=cv2.addWeighted(mask,.58,aligned,.42,0); cv2.imwrite(str(OUT/'winter-id-mask-overlay.png'),overlay)
    territories=[]; review=[]; counts=Counter()
    for color,(kind,level,expected) in PALETTE.items():
        binary=(np.all(mask==color,axis=2).astype('uint8'))
        n,labels,stats,centroids=cv2.connectedComponentsWithStats(binary,8)
        pieces=[]
        for label in range(1,n):
            if stats[label,cv2.CC_STAT_AREA] < 1000: continue
            contour,_=cv2.findContours((labels==label).astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
            if not contour: continue
            p=cv2.approxPolyDP(contour[0],1.0,True).reshape(-1,2)
            if len(p)<3: continue
            poly=Polygon(p)
            if not poly.is_valid: poly=poly.buffer(0)
            if poly.geom_type!='Polygon':
                review.append({'cell':f'{kind}-{level}','issue':'multipart','severity':'blocking'});continue
            rp=poly.representative_point(); pieces.append((rp.y,rp.x,poly,rp))
        pieces.sort(key=lambda item:(round(item[0],2),round(item[1],2)))
        counts[(kind,level)]=len(pieces)
        if len(pieces)!=expected: review.append({'type':kind,'level':level,'issue':'count_mismatch','expected':expected,'actual':len(pieces),'severity':'blocking'})
        prefix='b' if kind=='bastion' else 'pg'
        for i,(y,x,poly,rp) in enumerate(pieces,1):
            tid=f'winter-{prefix}{level}-{i:03d}'
            territories.append({'id':tid,'name':f'{"Б" if prefix=="b" else "ПГ"}{level}.{i}','type':'bastion' if prefix=='b' else 'tradingPost','size':f'L{level}' if prefix=='b' else '—','x':round(rp.x,2),'y':round(rp.y,2),'value':0,'copperPerHour':0,'defaultShape':'polygon','points':[[round(float(px-rp.x),2),round(float(py-rp.y),2)] for px,py in list(poly.exterior.coords)[:-1]],'baseColor':'#eef2ea' if prefix=='b' else '#d8e3ea','sourceId':tid,'winterType':kind,'winterLevel':level})
    # The central uncolored hole is a decorative region. Other black/white pixels are map lines/background.
    edges=[]
    for i,a in enumerate(territories):
        ga=Polygon([(a['x']+x,a['y']+y) for x,y in a['points']])
        for b in territories[i+1:]:
            gb=Polygon([(b['x']+x,b['y']+y) for x,y in b['points']])
            # Contours stop at the black line: only near-touching cells are candidate passages.
            if ga.distance(gb)<=10.0 and ga.buffer(5).intersection(gb.buffer(5)).area>100:
                edges.append({'id':f"{a['id']}--{b['id']}",'from':a['id'],'to':b['id']})
    data={'id':'winter-2026','name':'Зимнее событие','renderer':'konva','variant':'polygon','eventRules':'generic','backgroundColor':'#f8f8fb','connectionColor':'#53616a','width':1280,'height':1280,'territories':territories,'connections':edges,'bases':[],'baseConnections':[],'decorations':[{'id':'winter-arcadia','name':'Аркадия','x':640,'y':640,'points':[[-90,0],[0,-90],[90,0],[0,90]],'fill':'#ffffff'}]}
    (OUT/'winter-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT.parent/'data'/'winter-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'review.json').write_text(json.dumps({'expectedTotal':168,'actualTotal':len(territories),'counts':{f'{k}-{n}':v for (k,n),v in counts.items()},'candidateConnections':len(edges),'unresolvedPassagePolicy':True,'issues':review},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'territories':len(territories),'candidateConnections':len(edges),'reviewIssues':len(review),'counts':{f'{k}-{n}':v for (k,n),v in counts.items()}},ensure_ascii=False))
if __name__=='__main__': main()
