#!/usr/bin/env python3
"""Convert the supplied Excel grid into the static browser map dataset.

No third-party package is needed: an xlsx file is a ZIP of XML documents.
The source workbook uses style 52 for circular lairs and style 46 for square
workbenches. The legend starts in column FH, so only the map area C:EY is read.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Битва за нефть 8 (2).xlsx"
TARGET = ROOT / "data" / "generated" / "gene-clash-map.excel.generated.json"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CONFIG = json.loads((ROOT / "data" / "game-config.json").read_text(encoding="utf-8"))
VALUES = {
    "lair": {size: entry["value"] for size, entry in CONFIG["lairs"].items()},
    "workbench": {size: entry["value"] for size, entry in CONFIG["workbenches"].items()},
}


def cell_position(reference: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", reference)
    if not match:
        raise ValueError(f"Invalid Excel cell: {reference}")
    column = 0
    for character in match.group(1):
        column = column * 26 + ord(character) - 64
    return column, int(match.group(2))


def main() -> None:
    with ZipFile(SOURCE) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(f"{{{NS}}}t"))
            for item in shared_root.findall(f"{{{NS}}}si")
        ]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    territories = []
    name_pattern = re.compile(r"^(XS|S|M|L|XL|XXL)(\d{2})$")
    for cell in sheet.iter(f"{{{NS}}}c"):
        if cell.attrib.get("t") != "s" or cell.attrib.get("s") not in {"46", "52"}:
            continue
        value_node = cell.find(f"{{{NS}}}v")
        if value_node is None:
            continue
        name = shared[int(value_node.text or "0")]
        match = name_pattern.fullmatch(name)
        if not match:
            continue
        column, row = cell_position(cell.attrib["r"])
        if column >= 164:  # FH and beyond contain the workbook legend/tables.
            continue
        territory_type = "lair" if cell.attrib["s"] == "52" else "workbench"
        size = match.group(1)
        territories.append(
            {
                "id": f"{territory_type}-{name}",
                "name": name,
                "type": territory_type,
                "size": size,
                "x": (column - 3) * 16 + 42,
                "y": (row - 3) * 16 + 42,
                "value": VALUES[territory_type][size],
                "defaultShape": "circle" if territory_type == "lair" else "square",
                "sourceCell": cell.attrib["r"],
            }
        )

    payload = {
        "id": "gene-clash-oil-clash",
        "name": "Gene Clash · Oil Clash",
        "width": 2520,
        "height": 2440,
        "source": SOURCE.name,
        "territories": territories,
        "connections": [],
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {TARGET.relative_to(ROOT)} with {len(territories)} territories")


if __name__ == "__main__":
    main()
