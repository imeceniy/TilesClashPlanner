#!/usr/bin/env python3
"""Validate the prepared new-event map before planner integration."""

from __future__ import annotations

import json
import hashlib
from collections import defaultdict, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "New event" / "new-event-map.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> None:
    data = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    require(data["schemaVersion"] == 1, "Unsupported schemaVersion")
    require(data["width"] > 0 and data["height"] > 0, "Invalid dimensions")
    require(
        data["sourceSha256"]["coordinate"] == hashlib.sha256((ROOT / "New event" / "Схематично.jpg").read_bytes()).hexdigest(),
        "Canonical schematic checksum mismatch",
    )
    require(
        data["sourceSha256"]["information"]
        == hashlib.sha256((ROOT / "New event" / "Карта с информацией.jpg").read_bytes()).hexdigest(),
        "Information image checksum mismatch",
    )
    regions = data["regions"]
    by_id = {region["id"]: region for region in regions}
    require(len(by_id) == len(regions), "Region IDs must be unique")
    for region in regions:
        require(len(region["points"]) >= 3, f"{region['id']}: polygon is incomplete")
        require(
            all(0 <= x <= data["width"] and 0 <= y <= data["height"] for x, y in region["points"]),
            f"{region['id']}: point outside map",
        )
        if region["kind"] == "bastion":
            require(region["level"] in range(1, 7), f"{region['id']}: invalid bastion level")
            require(
                region["firstCapturePoints"]
                == data["metrics"]["bastionFirstCapturePoints"][str(region["level"])],
                f"{region['id']}: invalid points",
            )
        if region.get("resourceType") == "tradingPost":
            require(region["copperPerHour"] == 0, f"{region['id']}: trading post must yield zero copper")
        if region["kind"] == "center":
            require(region["name"] == "Аркадия" and region["interactive"] is False, "Arcadia must be inactive")
    adjacency: defaultdict[str, set[str]] = defaultdict(set)
    seen_edges: set[tuple[str, str]] = set()
    for edge in data["connections"]:
        require(edge["from"] in by_id and edge["to"] in by_id, f"{edge['id']}: unknown endpoint")
        require(
            by_id[edge["from"]].get("interactive", True) and by_id[edge["to"]].get("interactive", True),
            f"{edge['id']}: inactive endpoint",
        )
        key = tuple(sorted((edge["from"], edge["to"])))
        require(key not in seen_edges and key[0] != key[1], f"{edge['id']}: duplicate or self edge")
        seen_edges.add(key)
        adjacency[key[0]].add(key[1])
        adjacency[key[1]].add(key[0])
    active = [region["id"] for region in regions if region.get("interactive", True)]
    reached = {active[0]}
    queue = deque([active[0]])
    while queue:
        current = queue.popleft()
        for neighbour in adjacency[current] - reached:
            reached.add(neighbour)
            queue.append(neighbour)
    require(len(reached) == len(active), f"Graph disconnected: reached {len(reached)} of {len(active)}")
    print(
        json.dumps(
            {"regions": len(regions), "active": len(active), "connections": len(seen_edges), "graphComponents": 1},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
