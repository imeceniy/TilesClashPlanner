# Raster Map Graph Skill (v0.1.0)

A project-aware Agent Skill plus working Python CLI for converting a **raster + same-size color-labeled mask** into a canonical map candidate, geometry/graph diagnostics, and Konva HTML overlay.

## Requirements
Python 3.10+; `pip install -r requirements.txt`. Preview loads Konva 9 from jsDelivr unless the JS library is vendored locally. No raster-to-mask ML segmenter is bundled: ambiguous source maps must be annotated or segmented by a human/vision stage before strict extraction; never pretend certainty.

## Quick start
```bash
python scripts/inspect_project.py /path/to/react-project --output /tmp/project-map-inspection.json
python scripts/build_map.py --image examples/example-map.png --mask examples/example-mask.png --regions examples/regions.json --rules examples/rules.json --out /tmp/map-candidate
python scripts/validate_map.py /tmp/map-candidate/map.candidate.json --report /tmp/map-candidate/validation.json
python scripts/render_preview.py /tmp/map-candidate/map.candidate.json --image examples/example-map.png --output /tmp/map-candidate/preview.html
python -m unittest discover -s tests -v
```

The files in `examples/generated/` are produced from a synthetic demo map. They are **not** application MapData. The default JSON is an intermediate schema. The skill instructs the coding agent to read real interfaces and write an adapter against the user's project, run its declared checks, and avoid overwriting any map/plans.

## Status semantics
`reviewRequired: true` means *stop*. Validation exit code 0 means only canonical structure validated, **not** that the project loader accepts it. `NOT_PROJECT_ADAPTED` warning is intentionally emitted until real code integration. `COVERAGE_UNVERIFIED` means we cannot distinguish a missing territory from intended background without an authoritative coverage mask/polygon.

## Exact topology notes
Color mask cells are polygonized on a common pixel grid; polygons obtained from the same labeled raster share exact pixel-edge coordinates. This is reliable for labeled masks, not for ambiguous boundaries in the source image. `center` is a polygon interior point (for Konva label placement). Portal edges may link nonadjacent areas when explicitly allowed; normal passages require shared border, not corner contact.

## What is NOT included
No inference of unknown event rewards/rules; no automatic hallucinated passages; no guaranteed auto-compatibility with unseen TypeScript types; no offline Konva binary; no ML auto-labeling of arbitrary map images. The automated stage starts once a reliably labeled mask is supplied. Integrating a model-assisted mask stage should always produce confidence flags and review queue.
