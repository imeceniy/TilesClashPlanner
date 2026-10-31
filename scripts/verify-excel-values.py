#!/usr/bin/env python3
"""Verify that map/config rewards match Excel column «Дают очков»."""

from __future__ import annotations

import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Битва за нефть 8 (2).xlsx"
MAP = ROOT / "data" / "gene-clash-map.json"
CONFIG = ROOT / "data" / "game-config.json"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def column_number(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        raise ValueError(f"Некорректная ячейка {reference}")
    result = 0
    for character in letters.group(0):
        result = result * 26 + ord(character) - 64
    return result


def column_name(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def excel_rewards() -> dict[tuple[str, str], int]:
    with ZipFile(SOURCE) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(node.text or "" for node in item.iter(f"{{{NS}}}t")) for item in shared_root.findall(f"{{{NS}}}si")]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    cells: dict[str, str] = {}
    for cell in sheet.iter(f"{{{NS}}}c"):
        value_node = cell.find(f"{{{NS}}}v")
        if value_node is None:
            continue
        raw = value_node.text or ""
        cells[cell.attrib["r"]] = shared[int(raw)] if cell.attrib.get("t") == "s" else raw
    header = next(reference for reference, value in cells.items() if value.strip().casefold() == "дают очков")
    reward_column = column_number(header)
    header_row = int(re.search(r"\d+", header).group(0))  # type: ignore[union-attr]
    name_column = column_name(reward_column - 2)
    category_column = column_name(reward_column - 3)
    category = ""
    rewards: dict[tuple[str, str], int] = {}
    for row in range(header_row + 1, 1000):
        marker = cells.get(f"{category_column}{row}", "").strip().upper()
        if marker == "ЛОГОВА":
            category = "lair"
        elif marker == "ВЫШКИ":
            category = "workbench"
        name = cells.get(f"{name_column}{row}", "").strip()
        value = cells.get(f"{column_name(reward_column)}{row}", "").strip()
        if category and re.fullmatch(r"(?:XS|S|M|L|XL|XXL)\d{2}", name) and value:
            rewards[(category, name)] = int(float(value))
        if len(rewards) == 165:
            break
    return rewards


def main() -> None:
    rewards = excel_rewards()
    map_data = json.loads(MAP.read_text(encoding="utf-8"))
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if len(rewards) != 165:
        raise AssertionError(f"В Excel найдено {len(rewards)} объектов вместо 165")
    for territory in map_data["territories"]:
        key = (territory["type"], territory["name"])
        expected = rewards.get(key)
        if territory["value"] != expected:
            raise AssertionError(f"{territory['id']}: карта={territory['value']}, Excel={expected}")
        config_group = "lairs" if territory["type"] == "lair" else "workbenches"
        configured = config[config_group][territory["size"]]["value"]
        if configured != expected:
            raise AssertionError(f"{territory['id']}: config={configured}, Excel={expected}")
    print("Excel rewards verified: 165/165 values match column «Дают очков»")


if __name__ == "__main__":
    main()
