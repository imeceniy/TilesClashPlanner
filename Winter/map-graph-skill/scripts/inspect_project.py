#!/usr/bin/env python3
"""Read-only reconnaissance: discover native TS contracts and executable npm scripts."""
import argparse,json,re
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('project');p.add_argument('--output');a=p.parse_args()
    root=Path(a.project).resolve(); package=root/'package.json'
    out={'root':str(root),'mapFiles':[],'typeDefinitions':[],'packageScripts':{},'recommendedChecks':[],'warnings':[]}
    if package.exists():
        data=json.loads(package.read_text(encoding='utf-8'));out['packageScripts']=data.get('scripts',{})
    else:out['warnings'].append('No root package.json; inspect workspace package manifests')
    pats=re.compile(r'\b(MapData|TerritoryConnection|Territory)\b|loadMap|mapCatalog|territor',re.I)
    skip={'node_modules','.git','dist','build','.next','coverage'}
    for path in root.rglob('*'):
        if not path.is_file() or any(part in skip for part in path.relative_to(root).parts):continue
        rel=str(path.relative_to(root))
        if len(out['mapFiles'])<100 and path.suffix.lower() in ('.json','.png','.jpg','.webp') and 'map' in rel.lower():out['mapFiles'].append(rel)
        if path.suffix not in ('.ts','.tsx','.js','.mjs'):continue
        if path.stat().st_size>1_000_000:continue
        contents=path.read_text(encoding='utf-8',errors='replace')
        for n,line in enumerate(contents.splitlines(),1):
            if pats.search(line) and len(out['typeDefinitions'])<160:out['typeDefinitions'].append({'file':rel,'line':n,'text':line[:200]})
    scripts=out['packageScripts']
    for target,opts in [('typecheck',['typecheck','check-types','tsc']),('lint',['lint']),('test',['test:map','test:maps','test']),('build',['build'])]:
        matches=[k for k in opts if k in scripts]
        if matches:out['recommendedChecks'].append({'kind':target,'command':'npm run '+matches[0]})
        else:out['warnings'].append('No declared '+target+' script; manually inspect tooling')
    text=json.dumps(out,ensure_ascii=False,indent=2)
    if a.output:Path(a.output).write_text(text,encoding='utf-8')
    print(text)
if __name__=='__main__':main()
