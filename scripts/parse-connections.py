#!/usr/bin/env python3
"""Extract the visible connection graph from the supplied reference photo.

The image is a rendered version of the Excel map. Territory centers therefore
have a deterministic affine mapping to image pixels. A connection is accepted
when dark pixels form a continuous segment between two object boundaries.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "data" / "gene-clash-map.json"
OUTPUT_PATH = ROOT / "data" / "generated" / "gene-clash-map.connections.generated.json"
PHOTO = next(ROOT.glob("photo*.jpg"))
SOURCE = ROOT / "Битва за нефть 8 (2).xlsx"
WIDTH, HEIGHT = 1280, 1246
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
GRID_EMU = 190_500
GRID_SIZE = 16

# Nine lower-confidence paths are visually clear in the reference but cross
# labels/other outlines, which interrupts the otherwise continuous pixel line.
MANUAL_CONNECTIONS = {
    ("lair-XS16", "workbench-S10"),
    ("lair-XS20", "workbench-S12"),
    ("lair-XS46", "workbench-S22"),
    ("lair-XS46", "workbench-S26"),
    ("workbench-S07", "lair-XS13"),
    ("workbench-S07", "lair-XS18"),
    ("workbench-L02", "workbench-S09"),
    ("workbench-L02", "workbench-S11"),
    ("workbench-L11", "workbench-S22"),
    ("workbench-L11", "workbench-S24"),
    ("workbench-S26", "lair-XS47"),
    ("workbench-S26", "lair-XS52"),
    ("lair-XS23", "lair-XS17"),
    ("lair-XS23", "lair-XS24"),
    ("lair-XS61", "lair-XS55"),
    ("lair-XS61", "lair-XS56"),
}

BASES = [
    {"id": "base-nw", "name": "Северо-запад", "x": 530, "y": 42, "defaultColor": "#16b83f"},
    {"id": "base-ne", "name": "Северо-восток", "x": 1971, "y": 42, "defaultColor": "#34cf12"},
    {"id": "base-w", "name": "Запад", "x": 38, "y": 566, "defaultColor": "#1684ef"},
    {"id": "base-e", "name": "Восток", "x": 2461, "y": 533, "defaultColor": "#6f00e8"},
    {"id": "base-sw", "name": "Юго-запад", "x": 37, "y": 1842, "defaultColor": "#c10bc7"},
    {"id": "base-se", "name": "Юго-восток", "x": 2461, "y": 1843, "defaultColor": "#ef1111"},
    {"id": "base-ssw", "name": "Нижняя западная", "x": 595, "y": 2398, "defaultColor": "#c7b817"},
    {"id": "base-sse", "name": "Нижняя восточная", "x": 1905, "y": 2398, "defaultColor": "#e5006d"},
]

BASE_CONNECTIONS = {
    "base-nw": ["lair-XS02", "lair-XS07", "lair-XS08"],
    "base-ne": ["lair-XS22", "lair-XS26", "lair-XS32"],
    "base-w": ["lair-XS01", "lair-XS03", "lair-XS04"],
    "base-e": ["lair-XS38", "lair-XS42", "lair-XS48"],
    "base-sw": ["lair-XS17", "lair-XS23", "lair-XS27"],
    "base-se": ["lair-XS60", "lair-XS62", "lair-XS64"],
    "base-ssw": ["lair-XS33", "lair-XS39", "lair-XS43"],
    "base-sse": ["lair-XS57", "lair-XS58", "lair-XS63"],
}


def grayscale_image() -> bytes:
    convert = shutil.which("convert")
    if not convert:
        raise RuntimeError("ImageMagick `convert` is required to parse the reference photo")
    pixels = subprocess.check_output([convert, str(PHOTO), "-colorspace", "Gray", "gray:-"])
    if len(pixels) != WIDTH * HEIGHT:
        raise RuntimeError(f"Unexpected photo dimensions or pixel format: {len(pixels)} bytes")
    return pixels


def line_score(pixels: bytes, first: tuple[float, float], second: tuple[float, float]) -> float:
    x1, y1 = first
    x2, y2 = second
    distance = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / distance, (y2 - y1) / distance
    best = 0.0
    for offset in range(-5, 6):
        dark = total = 0
        for step in range(35, int(distance) - 35):
            x = x1 + ux * step - uy * offset
            y = y1 + uy * step + ux * offset
            found = False
            for thickness in (-2, -1, 0, 1, 2):
                px = round(x - uy * thickness)
                py = round(y + ux * thickness)
                if 0 <= px < WIDTH and 0 <= py < HEIGHT and pixels[py * WIDTH + px] < 90:
                    found = True
                    break
            dark += found
            total += 1
        if total:
            best = max(best, dark / total)
    return best


def workbook_segments() -> list[dict[str, float]]:
    """Read every original connector directly from the workbook drawing.

    Excel stores connectors as absolute DrawingML transforms. One map grid cell
    is 190500 EMU in the workbook and 16 units in the browser map. Using these
    transforms preserves all paths, including connectors that cross labels and
    therefore cannot be recovered reliably from the compressed reference JPEG.
    """
    with ZipFile(SOURCE) as archive:
        root = ET.fromstring(archive.read("xl/drawings/drawing1.xml"))
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    segments = []
    sheet_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    default_height = float(sheet.find(f"{{{sheet_ns}}}sheetFormatPr").attrib["defaultRowHeight"])
    row_heights = {
        int(row.attrib["r"]): float(row.attrib.get("ht", default_height))
        for row in sheet.findall(f".//{{{sheet_ns}}}row")
    }
    xfrm_tag = f"{{{DRAWINGML_NS}}}xfrm"
    connector_tag = f"{{{DRAWING_NS}}}cxnSp"

    def marker_position(marker: ET.Element) -> tuple[float, float]:
        column = int(marker.find(f"{{{DRAWING_NS}}}col").text or 0)
        column_offset = int(marker.find(f"{{{DRAWING_NS}}}colOff").text or 0)
        row = int(marker.find(f"{{{DRAWING_NS}}}row").text or 0)
        row_offset = int(marker.find(f"{{{DRAWING_NS}}}rowOff").text or 0)
        row_emu = row_heights.get(row + 1, default_height) * 12_700
        return (
            column * GRID_SIZE + 10 + column_offset / GRID_EMU * GRID_SIZE,
            row * GRID_SIZE + 10 + row_offset / row_emu * GRID_SIZE,
        )

    for anchor in root:
        connector = anchor.find(connector_tag)
        if connector is None:
            continue
        transform = connector.find(f".//{xfrm_tag}")
        if transform is None:
            continue
        from_marker = anchor.find(f"{{{DRAWING_NS}}}from")
        to_marker = anchor.find(f"{{{DRAWING_NS}}}to")
        if from_marker is None or to_marker is None:
            continue
        (x1, y1), (x2, y2) = marker_position(from_marker), marker_position(to_marker)
        if transform.attrib.get("flipH") == "1":
            x1, x2 = x2, x1
        if transform.attrib.get("flipV") == "1":
            y1, y2 = y2, y1
        segments.append({
            "x1": round(x1, 3), "y1": round(y1, 3),
            "x2": round(x2, 3), "y2": round(y2, 3),
        })
    return segments


def workbook_connections(objects: list[dict], bases: list[dict]) -> list[dict[str, str]]:
    """Match every workbook connector to a unique pair of map objects."""
    with ZipFile(SOURCE) as archive:
        root = ET.fromstring(archive.read("xl/drawings/drawing1.xml"))
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    sheet_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    default_height = float(sheet.find(f"{{{sheet_ns}}}sheetFormatPr").attrib["defaultRowHeight"])
    row_heights = {
        int(row.attrib["r"]): float(row.attrib.get("ht", default_height))
        for row in sheet.findall(f".//{{{sheet_ns}}}row")
    }
    centers = {item["id"]: (item["x"], item["y"]) for item in objects + bases}

    def marker_position(marker: ET.Element) -> tuple[float, float]:
        column = int(marker.find(f"{{{DRAWING_NS}}}col").text or 0)
        column_offset = int(marker.find(f"{{{DRAWING_NS}}}colOff").text or 0)
        row = int(marker.find(f"{{{DRAWING_NS}}}row").text or 0)
        row_offset = int(marker.find(f"{{{DRAWING_NS}}}rowOff").text or 0)
        row_emu = row_heights.get(row + 1, default_height) * 12_700
        return (
            column * GRID_SIZE + 10 + column_offset / GRID_EMU * GRID_SIZE,
            row * GRID_SIZE + 10 + row_offset / row_emu * GRID_SIZE,
        )

    rows: list[dict[tuple[str, str], float]] = []
    universe: set[tuple[str, str]] = set()
    for anchor in root:
        connector = anchor.find(f"{{{DRAWING_NS}}}cxnSp")
        if connector is None:
            continue
        transform = connector.find(f".//{{{DRAWINGML_NS}}}xfrm")
        first_marker = anchor.find(f"{{{DRAWING_NS}}}from")
        second_marker = anchor.find(f"{{{DRAWING_NS}}}to")
        if transform is None or first_marker is None or second_marker is None:
            continue
        first, second = marker_position(first_marker), marker_position(second_marker)
        if transform.attrib.get("flipH") == "1":
            first = (second[0], first[1])
            second = (first[0], second[1])
        if transform.attrib.get("flipV") == "1":
            first_y, second_y = first[1], second[1]
            first, second = (first[0], second_y), (second[0], first_y)
        nearest_first = sorted((math.dist(first, point), item_id) for item_id, point in centers.items())[:10]
        nearest_second = sorted((math.dist(second, point), item_id) for item_id, point in centers.items())[:10]
        candidates: dict[tuple[str, str], float] = {}
        for first_distance, first_id in nearest_first:
            for second_distance, second_id in nearest_second:
                if first_id == second_id:
                    continue
                edge = tuple(sorted((first_id, second_id)))
                candidates[edge] = min(candidates.get(edge, float("inf")), first_distance + second_distance)
        rows.append(candidates)
        universe.update(candidates)

    # Rectangular Hungarian assignment: each DrawingML connector gets a unique edge.
    columns = list(universe)
    row_count, column_count = len(rows), len(columns)
    infinity = 1_000_000.0
    u = [0.0] * (row_count + 1)
    v = [0.0] * (column_count + 1)
    matching = [0] * (column_count + 1)
    way = [0] * (column_count + 1)
    for row_index in range(1, row_count + 1):
        matching[0] = row_index
        column = 0
        minimum = [infinity] * (column_count + 1)
        used = [False] * (column_count + 1)
        while True:
            used[column] = True
            active_row = matching[column]
            delta, next_column = infinity, 0
            costs = rows[active_row - 1]
            for candidate_column in range(1, column_count + 1):
                if used[candidate_column]:
                    continue
                reduced = costs.get(columns[candidate_column - 1], infinity) - u[active_row] - v[candidate_column]
                if reduced < minimum[candidate_column]:
                    minimum[candidate_column], way[candidate_column] = reduced, column
                if minimum[candidate_column] < delta:
                    delta, next_column = minimum[candidate_column], candidate_column
            for candidate_column in range(column_count + 1):
                if used[candidate_column]:
                    u[matching[candidate_column]] += delta
                    v[candidate_column] -= delta
                else:
                    minimum[candidate_column] -= delta
            column = next_column
            if matching[column] == 0:
                break
        while True:
            previous = way[column]
            matching[column] = matching[previous]
            column = previous
            if column == 0:
                break

    assigned: list[tuple[str, str] | None] = [None] * row_count
    for column in range(1, column_count + 1):
        if matching[column]:
            assigned[matching[column] - 1] = columns[column - 1]
    territory_ids = {item["id"] for item in objects}
    # One stale workbook anchor overlaps the eastern base connector; its inferred
    # XS42–XS48 edge is not present in the reference image.
    stale_edge = tuple(sorted(("lair-XS42", "lair-XS48")))
    edges = {
        edge for edge in assigned
        if edge and edge != stale_edge and edge[0] in territory_ids and edge[1] in territory_ids
    }
    if len(edges) != 200:
        raise RuntimeError(f"Expected 200 territory paths from workbook, got {len(edges)}")
    return [{"from": first, "to": second} for first, second in sorted(edges)]


def main() -> None:
    payload = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    pixels = grayscale_image()
    objects = payload["territories"]
    centers = {
        item["id"]: (item["x"] * 0.5 + 15, item["y"] * 0.5 + 13)
        for item in objects
    }
    connections: set[tuple[str, str]] = set()
    for index, first in enumerate(objects):
        for second in objects[index + 1 :]:
            point_a = centers[first["id"]]
            point_b = centers[second["id"]]
            distance = math.dist(point_a, point_b)
            if not 65 <= distance <= 240:
                continue
            score = line_score(pixels, point_a, point_b)
            if score >= 0.85 or (score >= 0.70 and distance <= 180):
                connections.add(tuple(sorted((first["id"], second["id"]))))
    connections.update(tuple(sorted(pair)) for pair in MANUAL_CONNECTIONS)

    payload["connections"] = workbook_connections(objects, BASES)
    payload["bases"] = BASES
    payload["baseConnections"] = [
        {"from": base_id, "to": territory_id}
        for base_id, territory_ids in BASE_CONNECTIONS.items()
        for territory_id in territory_ids
    ]
    payload["connectionSource"] = PHOTO.name
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Added {len(payload['connections'])} exact territory paths, "
        f"{len(BASES)} bases and 24 base paths"
    )


if __name__ == "__main__":
    main()
