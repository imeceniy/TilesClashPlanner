#!/usr/bin/env python3
"""Convert the supplied Konva/TypeScript graph into the planner JSON format."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Map example" / "tilesSurviveGraph(2) (1).ts"
TARGET = ROOT / "data" / "generated" / "gene-clash-map.konva.generated.json"

BASES = {
    "BASE-TL": ("base-nw", "Северо-запад", "#20b73d"),
    "BASE-TR": ("base-ne", "Северо-восток", "#43cf12"),
    "BASE-L": ("base-w", "Запад", "#1684ef"),
    "BASE-R": ("base-e", "Восток", "#7416e8"),
    "BASE-BL": ("base-sw", "Юго-запад", "#c10bc7"),
    "BASE-BR": ("base-se", "Юго-восток", "#ef1111"),
    "BASE-BTL": ("base-ssw", "Нижняя западная", "#c7b817"),
    "BASE-BTR": ("base-sse", "Нижняя восточная", "#e5006d"),
}


def graph_id(node: dict) -> str:
    if node["group"] == "base":
        return BASES[node["id"]][0]
    if node["group"] == "workbench":
        return f"workbench-{node['label']}"
    return f"lair-{node['label']}"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    marker = "export const mapGraph: MapGraph = "
    graph_text = source.split(marker, 1)[1].split("\n};", 1)[0] + "\n}"
    graph = json.loads(graph_text)
    by_source_id = {node["id"]: node for node in graph["nodes"]}
    id_map = {source_id: graph_id(node) for source_id, node in by_source_id.items()}

    territories = []
    bases = []
    for node in graph["nodes"]:
        if node["group"] == "base":
            base_id, name, _ = BASES[node["id"]]
            bases.append({
                "id": base_id,
                "name": name,
                "x": node["x"],
                "y": node["y"],
                "defaultColor": node.get("baseColor", "#888888"),
                "sourceId": node["id"],
            })
            continue
        territory_type = "lair" if node["group"] == "lair" else "workbench"
        territories.append({
            "id": id_map[node["id"]],
            "name": node["label"],
            "type": territory_type,
            "size": node["size"],
            "x": node["x"],
            "y": node["y"],
            "value": node["value"],
            "defaultShape": "circle" if territory_type == "lair" else "square",
            "sourceId": node["id"],
        })

    connections = []
    base_connections = []
    for edge in graph["edges"]:
        source, target = id_map[edge["source"]], id_map[edge["target"]]
        item = {"id": edge["id"], "from": source, "to": target}
        if source.startswith("base-") or target.startswith("base-"):
            if target.startswith("base-"):
                item["from"], item["to"] = target, source
            base_connections.append(item)
        else:
            connections.append(item)

    payload = {
        "id": "gene-clash-oil-clash-season-5",
        "name": "Gene Clash · Oil Clash",
        "width": graph["width"],
        "height": graph["height"],
        "source": str(SOURCE.relative_to(ROOT)),
        "renderer": "konva",
        "territories": territories,
        "connections": connections,
        "bases": bases,
        "baseConnections": base_connections,
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Imported {len(territories)} territories, {len(connections)} territory paths, "
        f"{len(bases)} bases and {len(base_connections)} base paths"
    )


if __name__ == "__main__":
    main()
