#!/usr/bin/env python3
"""Generate Konva overlay review page with embedded image + candidate map."""
import argparse,base64,json,mimetypes,html
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('map');p.add_argument('--image',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    data=json.loads(Path(a.map).read_text(encoding='utf-8'))
    ext=mimetypes.guess_type(a.image)[0] or 'image/png'
    image='data:'+ext+';base64,'+base64.b64encode(Path(a.image).read_bytes()).decode()
    payload=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    im=json.dumps(image)
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><title>Raster Map Graph Review</title>
<style>body{font:14px system-ui;margin:0;background:#18191e;color:#f4f4f4} header{padding:12px 20px;background:#282b33;display:flex;gap:18px;align-items:center}#stage{width:100vw;height:calc(100vh - 76px);overflow:hidden}label{cursor:pointer}small{color:#b9bfcc}</style>
<header><strong>Map review • Konva</strong><label><input id="showLabels" type="checkbox" checked> IDs</label><label><input id="showEdges" type="checkbox" checked> passages</label><label><input id="showBorders" type="checkbox" checked> polygons</label><small>Wheel: zoom • drag: pan • click territory: details</small><span id="status"></span></header><div id="stage"></div>
<script src="https://cdn.jsdelivr.net/npm/konva@9/konva.min.js"></script><script>
const map=__MAP__, imageURL=__IMAGE__;
if (!window.Konva) {document.getElementById('stage').textContent='Konva not available. Install a local Konva bundle or connect to CDN.';throw Error('Konva absent');}
const root=document.getElementById('stage'), stage=new Konva.Stage({container:'stage',width:root.clientWidth,height:root.clientHeight,draggable:true});
const imageLayer=new Konva.Layer(),borderLayer=new Konva.Layer(),edgeLayer=new Konva.Layer(),labelLayer=new Konva.Layer();
stage.add(imageLayer,borderLayer,edgeLayer,labelLayer);
const original=new Image();original.onload=()=>{imageLayer.add(new Konva.Image({image:original,width:map.image.width,height:map.image.height}));const fit=Math.min(root.clientWidth/map.image.width,root.clientHeight/map.image.height,1);stage.scale({x:fit,y:fit});stage.position({x:(root.clientWidth-map.image.width*fit)/2,y:(root.clientHeight-map.image.height*fit)/2});stage.batchDraw();};original.src=imageURL;
const cache=new Map(map.territories.map(t=>[t.id,t]));
function rings(geom){return geom.type==='Polygon'?geom.coordinates:geom.coordinates.flatMap(poly=>poly);}
map.territories.forEach(t=>{rings(t.geometry).forEach((ring,j)=>{const points=ring.flatMap(p=>p);borderLayer.add(new Konva.Line({points,closed:true,stroke:t.decorative?'#aaa':'#00ebff',strokeWidth:1.6,fill:j===0?(t.active?'rgba(0,240,255,0.10)':'rgba(130,130,130,0.20)'):undefined,strokeScaleEnabled:false,hitStrokeWidth:8}));});const cp=t.center;const label=new Konva.Text({x:cp.x-30,y:cp.y-9,width:60,align:'center',text:String(t.id),fontSize:14,fontStyle:'bold',fill:t.active?'#ffffff':'#aaaaaa',shadowColor:'#000000',shadowBlur:5,shadowOpacity:1});label.on('click',()=>{document.getElementById('status').textContent=`${t.id} • ${t.type} • active=${t.active} • rewards=${JSON.stringify(t.rewards)}`});labelLayer.add(label);});
map.connections.forEach(e=>{const a=cache.get(e.from),b=cache.get(e.to);if(!a||!b)return;edgeLayer.add(new Konva.Arrow({points:[a.center.x,a.center.y,b.center.x,b.center.y],stroke:'#f7c548',fill:'#f7c548',strokeWidth:2,opacity:0.85,pointerLength:6,pointerWidth:6,dash:e.kind==='portal'?[8,5]:[],pointerAtBeginning:!e.directed}));});
stage.on('wheel',event=>{event.evt.preventDefault();const old=stage.scaleX(),pointer=stage.getPointerPosition(),world={x:(pointer.x-stage.x())/old,y:(pointer.y-stage.y())/old};const scale=Math.max(0.05,Math.min(20,old*(event.evt.deltaY>0?0.9:1.1)));stage.scale({x:scale,y:scale});stage.position({x:pointer.x-world.x*scale,y:pointer.y-world.y*scale});stage.batchDraw();});
[['showLabels',labelLayer],['showEdges',edgeLayer],['showBorders',borderLayer]].forEach(([id,layer])=>document.getElementById(id).addEventListener('change',e=>{layer.visible(e.target.checked);stage.batchDraw()}));
window.addEventListener('resize',()=>{stage.size({width:root.clientWidth,height:root.clientHeight});stage.batchDraw()});
</script></html>'''
    Path(a.output).write_text(page.replace('__MAP__',payload).replace('__IMAGE__',im),encoding='utf-8')
    print('Wrote',a.output,'(requires Konva 9 CDN unless locally vendored)')
if __name__=='__main__':main()
