#!/usr/bin/env python3
"""Extract an integration-ready interactive map from the two New event references."""

from __future__ import annotations

import json
import hashlib
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
EVENT_DIR = ROOT / "New event"
SCHEMATIC_PATH = EVENT_DIR / "Схематично.jpg"
INFORMATION_PATH = EVENT_DIR / "Карта с информацией.jpg"
OUTPUT_PATH = EVENT_DIR / "new-event-map.json"

MAP_CENTER = np.array([445.0, 445.0])
INFO_CENTER = np.array([640.0, 640.0])
INFO_SCALE = 1.58
TRACE_SCALE = 4

RESOURCE_PALETTE = {
    "tradingPost": (255, 255, 255),
    "militaryBase": (205, 55, 40),
    "researchCenter": (125, 80, 155),
    "megapolis": (243, 155, 21),
    "town": (80, 175, 85),
    "factory": (35, 155, 135),
    "village": (155, 166, 178),
}

RESOURCE_META = {
    "tradingPost": ("Торговый пост", "#fffef2", 0),
    "militaryBase": ("Военная база", "#d94235", 50),
    "researchCenter": ("Центр исследований", "#8052a0", 25),
    "megapolis": ("Мегаполис", "#f3a21f", 15),
    "town": ("Городок", "#50b15d", 10),
    "factory": ("Завод", "#22a18c", 3),
    "village": ("Деревня", "#9da9b5", 1),
}

BASTION_COLORS = {
    1: (214, 201, 169),
    2: (179, 167, 138),
    3: (165, 146, 110),
    4: (139, 114, 83),
    5: (106, 82, 49),
    6: (78, 54, 31),
}

BASTION_POINTS = {1: 200, 2: 400, 3: 600, 4: 800, 5: 1000, 6: 1500}
BASTION_HEX = {1: "#d8cbaa", 2: "#b5a78a", 3: "#a5926e", 4: "#8b7253", 5: "#6a5231", 6: "#4e361f"}


def to_information(point: tuple[float, float] | np.ndarray) -> np.ndarray:
    return INFO_CENTER + (np.asarray(point, dtype=float) - MAP_CENTER) * INFO_SCALE


def to_schematic(point: tuple[float, float] | np.ndarray) -> np.ndarray:
    return MAP_CENTER + (np.asarray(point, dtype=float) - INFO_CENTER) / INFO_SCALE


def polygon_from_mask(mask: np.ndarray, epsilon: float = 6.0, scale: int = TRACE_SCALE) -> list[list[float]]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    polygon = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2) / scale
    return [[round(float(x), 2), round(float(y), 2)] for x, y in polygon]


def extract_faces(schematic: np.ndarray) -> tuple[list[dict], np.ndarray]:
    enlarged = cv2.resize(schematic, None, fx=TRACE_SCALE, fy=TRACE_SCALE, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    walls = (gray < 110).astype(np.uint8) * 255
    walls = cv2.dilate(walls, np.ones((3, 3), np.uint8), iterations=1)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(255 - walls, 4)
    faces: list[dict] = []
    for label in range(1, count):
        x, y, width, height, area = (int(value) for value in stats[label])
        center_x, center_y = (float(value) / TRACE_SCALE for value in centroids[label])
        if not (
            150 * TRACE_SCALE**2 <= area <= 12_500 * TRACE_SCALE**2
            and 18 * TRACE_SCALE <= width <= 190 * TRACE_SCALE
            and 18 * TRACE_SCALE <= height <= 190 * TRACE_SCALE
        ):
            continue
        if not (28 <= center_x <= 862 and 28 <= center_y <= 862):
            continue
        component = np.zeros_like(labels, dtype=np.uint8)
        component[labels == label] = 255
        faces.append(
            {
                "sourceLabel": label,
                "center": [round(center_x, 2), round(center_y, 2)],
                "area": round(area / TRACE_SCALE**2),
                "points": polygon_from_mask(component),
            }
        )
    return faces, labels[::TRACE_SCALE, ::TRACE_SCALE]


def preserve_existing_contract(regions: list[dict]) -> tuple[list[dict], list[dict] | None]:
    """Keep stable IDs and graph edges while replacing only extracted geometry."""
    if not OUTPUT_PATH.exists():
        return regions, None
    previous = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    if previous.get("id") != "new-event-2026-09" or len(previous.get("regions", [])) != len(regions):
        return regions, None

    candidates = sorted(
        (
            ((old["center"][0] - new["center"][0]) ** 2 + (old["center"][1] - new["center"][1]) ** 2, old_index, new_index)
            for old_index, old in enumerate(previous["regions"])
            for new_index, new in enumerate(regions)
        ),
        key=lambda item: item[0],
    )
    used_old: set[int] = set()
    used_new: set[int] = set()
    matches: dict[int, int] = {}
    for distance_squared, old_index, new_index in candidates:
        if old_index in used_old or new_index in used_new:
            continue
        if distance_squared > 3**2:
            raise RuntimeError("New geometry no longer matches the stable map contract")
        used_old.add(old_index)
        used_new.add(new_index)
        matches[old_index] = new_index

    if len(matches) != len(regions):
        raise RuntimeError("Could not preserve every stable region ID")
    stable_regions = []
    for old_index, old in enumerate(previous["regions"]):
        geometry = regions[matches[old_index]]
        stable_regions.append({**old, "center": geometry["center"], "points": geometry["points"]})
    return stable_regions, previous.get("connections")


def extract_resources(information: np.ndarray) -> list[dict]:
    rgb = information[:, :, ::-1].astype(float)
    resources: list[dict] = []
    for resource_type, reference_color in RESOURCE_PALETTE.items():
        distance = np.linalg.norm(rgb - np.asarray(reference_color), axis=2)
        mask = (distance < 45).astype(np.uint8) * 255
        count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
        for label in range(1, count):
            x, y, width, height, area = (int(value) for value in stats[label])
            center_x, center_y = (float(value) for value in centroids[label])
            if not (600 <= area <= 7_000 and 25 <= width <= 120 and 25 <= height <= 120):
                continue
            if not (0.55 <= width / height <= 1.8):
                continue
            if abs(center_x - 640) + abs(center_y - 640) >= 650:
                continue
            resources.append(
                {
                    "type": resource_type,
                    "informationCenter": [center_x, center_y],
                    "center": to_schematic((center_x, center_y)).tolist(),
                    "informationSize": [width, height],
                }
            )
    return resources


def sample_rgb(image: np.ndarray, center: list[float], radius: int = 5) -> np.ndarray:
    x, y = (int(round(value)) for value in to_information(center))
    patch = image[max(0, y - radius) : y + radius + 1, max(0, x - radius) : x + radius + 1, ::-1]
    return np.median(patch.reshape(-1, 3), axis=0)


def infer_bastion_level(image: np.ndarray, center: list[float]) -> int:
    color = sample_rgb(image, center)
    distances = {level: float(np.linalg.norm(color - np.asarray(reference))) for level, reference in BASTION_COLORS.items()}
    level, distance = min(distances.items(), key=lambda item: item[1])
    if distance <= 58:
        return level
    x, y = center
    radius = max(abs(x - MAP_CENTER[0]), abs(y - MAP_CENTER[1]))
    if radius < 120:
        return 6
    if radius < 175:
        return 5
    if radius < 235:
        return 4
    if radius < 295:
        return 3
    if radius < 355:
        return 2
    return 1


def diamond(center: list[float], width: float, height: float) -> list[list[int]]:
    x, y = center
    half_width = max(18.0, width / INFO_SCALE / 2)
    half_height = max(18.0, height / INFO_SCALE / 2)
    return [
        [round(x), round(y - half_height)],
        [round(x + half_width), round(y)],
        [round(x), round(y + half_height)],
        [round(x - half_width), round(y)],
    ]


def match_resources(faces: list[dict], labels: np.ndarray, resources: list[dict]) -> tuple[set[int], list[dict]]:
    face_by_label = {face["sourceLabel"]: index for index, face in enumerate(faces)}
    occupied_faces: set[int] = set()
    prepared: list[dict] = []
    for resource in resources:
        center = resource["center"]
        x, y = (int(round(value)) for value in center)
        face_index = face_by_label.get(int(labels[y, x]))
        if face_index is not None and face_index not in occupied_faces:
            face = faces[face_index]
            points = face["points"]
            center = face["center"]
            occupied_faces.add(face_index)
        else:
            nearest = sorted(
                (
                    ((face["center"][0] - center[0]) ** 2 + (face["center"][1] - center[1]) ** 2, index)
                    for index, face in enumerate(faces)
                    if index not in occupied_faces
                ),
                key=lambda item: item[0],
            )
            if nearest and nearest[0][0] < 18**2:
                face_index = nearest[0][1]
                face = faces[face_index]
                points = face["points"]
                center = face["center"]
                occupied_faces.add(face_index)
            else:
                points = diamond(center, *resource["informationSize"])
        prepared.append({**resource, "center": [round(center[0], 2), round(center[1], 2)], "points": points})
    return occupied_faces, prepared


def build_connections(regions: list[dict], width: int, height: int) -> list[dict]:
    active = [region for region in regions if region.get("interactive", True)]
    canvas = np.zeros((height, width), dtype=np.int32)
    for index, region in enumerate(active, 1):
        cv2.fillPoly(canvas, [np.asarray(region["points"], dtype=np.int32)], index)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    edges: set[tuple[int, int]] = set()
    for index in range(1, len(active) + 1):
        mask = (canvas == index).astype(np.uint8)
        expanded = cv2.dilate(mask, kernel)
        neighbours = np.unique(canvas[(expanded > 0) & (canvas != index) & (canvas > 0)])
        for neighbour in neighbours:
            edges.add(tuple(sorted((index, int(neighbour)))))
    return [
        {"id": f"edge-{number:04d}", "from": active[left - 1]["id"], "to": active[right - 1]["id"]}
        for number, (left, right) in enumerate(sorted(edges), 1)
    ]


def build_map() -> dict:
    schematic = cv2.imread(str(SCHEMATIC_PATH))
    information = cv2.imread(str(INFORMATION_PATH))
    if schematic is None or information is None:
        raise RuntimeError("Reference images are missing")
    faces, labels = extract_faces(schematic)
    resources = extract_resources(information)
    occupied_faces, resources = match_resources(faces, labels, resources)

    bastions: list[dict] = []
    center_regions: list[dict] = []
    for index, face in enumerate(faces):
        if index in occupied_faces:
            continue
        center_x, center_y = face["center"]
        if face["area"] > 8_000 and abs(center_x - 445) < 35 and abs(center_y - 445) < 35:
            center_regions.append(face)
            continue
        level = infer_bastion_level(information, face["center"])
        bastions.append({**face, "level": level})

    regions: list[dict] = []
    counters: defaultdict[str, int] = defaultdict(int)
    for resource in sorted(resources, key=lambda item: (item["center"][1], item["center"][0])):
        resource_type = resource["type"]
        counters[resource_type] += 1
        title, color, copper = RESOURCE_META[resource_type]
        regions.append(
            {
                "id": f"{resource_type}-{counters[resource_type]:03d}",
                "kind": "resource",
                "resourceType": resource_type,
                "name": f"{title} {counters[resource_type]}",
                "center": resource["center"],
                "points": resource["points"],
                "color": color,
                "interactive": True,
                "firstCapturePoints": None,
                "copperPerHour": copper,
            }
        )
    for bastion in sorted(bastions, key=lambda item: (item["center"][1], item["center"][0])):
        level = bastion["level"]
        counters[f"bastion{level}"] += 1
        number = counters[f"bastion{level}"]
        regions.append(
            {
                "id": f"bastion-L{level}-{number:03d}",
                "kind": "bastion",
                "level": level,
                "name": f"Бастион ур. {level} · {number}",
                "center": bastion["center"],
                "points": bastion["points"],
                "color": BASTION_HEX[level],
                "interactive": True,
                "firstCapturePoints": BASTION_POINTS[level],
                "copperPerHour": None,
            }
        )
    for index, region in enumerate(center_regions, 1):
        regions.append(
            {
                "id": f"event-center-{index:02d}",
                "kind": "center",
                "name": "Аркадия",
                "center": region["center"],
                "points": region["points"],
                "color": "#f7f7f5",
                "interactive": False,
                "firstCapturePoints": None,
                "copperPerHour": None,
            }
        )

    regions, stable_connections = preserve_existing_contract(regions)
    connections = stable_connections or build_connections(regions, int(schematic.shape[1]), int(schematic.shape[0]))
    return {
        "schemaVersion": 1,
        "id": "new-event-2026-09",
        "name": "Медь",
        "coordinateSource": "Схематично.jpg",
        "informationSource": "Карта с информацией.jpg",
        "sourceSha256": {
            "coordinate": hashlib.sha256(SCHEMATIC_PATH.read_bytes()).hexdigest(),
            "information": hashlib.sha256(INFORMATION_PATH.read_bytes()).hexdigest(),
        },
        "width": int(schematic.shape[1]),
        "height": int(schematic.shape[0]),
        "center": [445, 445],
        "metrics": {
            "bastionFirstCapturePoints": {str(level): points for level, points in BASTION_POINTS.items()},
            "copperPerHour": {
                key: value[2] for key, value in RESOURCE_META.items() if value[2] is not None
            },
        },
        "regions": regions,
        "connections": connections,
        "extraction": {
            "closedFaces": len(faces),
            "resourceRegions": len(resources),
            "bastionRegions": len(bastions),
            "centerRegions": len(center_regions),
            "connections": len(connections),
            "adjacencyRadiusPx": 4,
            "traceScale": TRACE_SCALE,
            "traceEpsilonPx": 6,
            "note": "Geometry is traced at 4x resolution; stable IDs and reviewed graph edges are preserved.",
        },
    }


def main() -> None:
    data = build_map()
    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data["extraction"], ensure_ascii=False))


if __name__ == "__main__":
    main()
