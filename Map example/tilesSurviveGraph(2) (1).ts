// Tiles Survive — Season 5 Clash map.
// Geometry/topology is based on the supplied graph and synchronized with the Excel template
// "Битва за нефть 8 (2).xlsx". Labels intentionally match the workbook/game style: M30, XL04, etc.
// Coordinate system: 1280 x 1246.

export type GraphNodeShape = 'rect' | 'circle';
export type GraphNodeGroup = 'lair' | 'workbench' | 'base';
export type TerritorySize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface GraphNode {
  id: string;
  label: string;
  /** Base daily resource value from the supplied Season 5 planning workbook. */
  value: number | null;
  shape: GraphNodeShape;
  x: number;
  y: number;
  group: GraphNodeGroup;
  size?: TerritorySize | null;
  baseColor?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface MapGraph {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const SEASON = 5 as const;

/** Values used by the supplied Season 5 alliance planning workbook. */
export const SEASON5_VALUES = {
  lair: { XS: 80, S: 160, M: 200 },
  workbench: { S: 240, M: 320, L: 480, XL: 800, XXL: 1600 },
} as const;

export const mapGraph: MapGraph = {
  "width": 1280,
  "height": 1246,
  "nodes": [
    {
      "id": "XS-08",
      "label": "XS08",
      "value": 80,
      "shape": "circle",
      "x": 443.0,
      "y": 34.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-22",
      "label": "XS22",
      "value": 80,
      "shape": "circle",
      "x": 844.5,
      "y": 34.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-14",
      "label": "XS14",
      "value": 80,
      "shape": "circle",
      "x": 542.0,
      "y": 83.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-21",
      "label": "XS21",
      "value": 80,
      "shape": "circle",
      "x": 738.5,
      "y": 83.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-02",
      "label": "XS02",
      "value": 80,
      "shape": "circle",
      "x": 222.0,
      "y": 91.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-32",
      "label": "XS32",
      "value": 80,
      "shape": "circle",
      "x": 1058.0,
      "y": 91.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-26",
      "label": "XS26",
      "value": 80,
      "shape": "circle",
      "x": 918.5,
      "y": 116.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-07",
      "label": "XS07",
      "value": 80,
      "shape": "circle",
      "x": 370.0,
      "y": 124.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-06",
      "label": "XS06",
      "value": 80,
      "shape": "circle",
      "x": 288.0,
      "y": 157.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-31",
      "label": "XS31",
      "value": 80,
      "shape": "circle",
      "x": 992.5,
      "y": 157.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-16",
      "label": "XS16",
      "value": 80,
      "shape": "circle",
      "x": 542.0,
      "y": 173.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-25",
      "label": "XS25",
      "value": 80,
      "shape": "circle",
      "x": 862.0,
      "y": 173.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-20",
      "label": "XS20",
      "value": 80,
      "shape": "circle",
      "x": 738.0,
      "y": 174.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-12",
      "label": "XS12",
      "value": 80,
      "shape": "circle",
      "x": 427.0,
      "y": 182.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-11",
      "label": "XS11",
      "value": 80,
      "shape": "circle",
      "x": 354.0,
      "y": 206.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-30",
      "label": "XS30",
      "value": 80,
      "shape": "circle",
      "x": 926.5,
      "y": 206.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-01",
      "label": "XS01",
      "value": 80,
      "shape": "circle",
      "x": 100.0,
      "y": 214.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-38",
      "label": "XS38",
      "value": 80,
      "shape": "circle",
      "x": 1181.0,
      "y": 214.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-02",
      "label": "M02",
      "value": 200,
      "shape": "circle",
      "x": 476.0,
      "y": 230.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-13",
      "label": "M13",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 231.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-05",
      "label": "XS05",
      "value": 80,
      "shape": "circle",
      "x": 165.0,
      "y": 280.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "S-02",
      "label": "S02",
      "value": 160,
      "shape": "circle",
      "x": 525.5,
      "y": 280.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "XS-37",
      "label": "XS37",
      "value": 80,
      "shape": "circle",
      "x": 1115.0,
      "y": 280.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "S-04",
      "label": "S04",
      "value": 160,
      "shape": "circle",
      "x": 747.0,
      "y": 288.5,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "M-05",
      "label": "M05",
      "value": 200,
      "shape": "circle",
      "x": 476.0,
      "y": 329.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-17",
      "label": "M17",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 329.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-07",
      "label": "M07",
      "value": 200,
      "shape": "circle",
      "x": 574.0,
      "y": 329.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-12",
      "label": "M12",
      "value": 200,
      "shape": "circle",
      "x": 697.5,
      "y": 337.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-10",
      "label": "XS10",
      "value": 80,
      "shape": "circle",
      "x": 222.0,
      "y": 337.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-36",
      "label": "XS36",
      "value": 80,
      "shape": "circle",
      "x": 1058.0,
      "y": 337.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-04",
      "label": "XS04",
      "value": 80,
      "shape": "circle",
      "x": 132.0,
      "y": 345.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-42",
      "label": "XS42",
      "value": 80,
      "shape": "circle",
      "x": 1148.0,
      "y": 346.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-09",
      "label": "XS09",
      "value": 80,
      "shape": "circle",
      "x": 190.0,
      "y": 402.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-41",
      "label": "XS41",
      "value": 80,
      "shape": "circle",
      "x": 1091.0,
      "y": 402.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-48",
      "label": "XS48",
      "value": 80,
      "shape": "circle",
      "x": 1246.0,
      "y": 410.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-03",
      "label": "XS03",
      "value": 80,
      "shape": "circle",
      "x": 34.0,
      "y": 411.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-16",
      "label": "M16",
      "value": 200,
      "shape": "circle",
      "x": 706.0,
      "y": 459.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-01",
      "label": "M01",
      "value": 200,
      "shape": "circle",
      "x": 247.0,
      "y": 460.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-03",
      "label": "M03",
      "value": 200,
      "shape": "circle",
      "x": 346.0,
      "y": 460.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-11",
      "label": "M11",
      "value": 200,
      "shape": "circle",
      "x": 574.5,
      "y": 460.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-21",
      "label": "M21",
      "value": 200,
      "shape": "circle",
      "x": 935.0,
      "y": 460.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-27",
      "label": "M27",
      "value": 200,
      "shape": "circle",
      "x": 1033.0,
      "y": 460.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-13",
      "label": "XS13",
      "value": 80,
      "shape": "circle",
      "x": 91.5,
      "y": 468.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-47",
      "label": "XS47",
      "value": 80,
      "shape": "circle",
      "x": 1189.0,
      "y": 468.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "S-01",
      "label": "S01",
      "value": 160,
      "shape": "circle",
      "x": 296.0,
      "y": 509.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "S-06",
      "label": "S06",
      "value": 160,
      "shape": "circle",
      "x": 984.0,
      "y": 509.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "XS-15",
      "label": "XS15",
      "value": 80,
      "shape": "circle",
      "x": 165.0,
      "y": 526.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-46",
      "label": "XS46",
      "value": 80,
      "shape": "circle",
      "x": 1115.0,
      "y": 526.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-06",
      "label": "M06",
      "value": 200,
      "shape": "circle",
      "x": 345.5,
      "y": 558.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-20",
      "label": "M20",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 558.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-26",
      "label": "M26",
      "value": 200,
      "shape": "circle",
      "x": 934.5,
      "y": 558.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-10",
      "label": "M10",
      "value": 200,
      "shape": "circle",
      "x": 468.0,
      "y": 566.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-04",
      "label": "M04",
      "value": 200,
      "shape": "circle",
      "x": 574.5,
      "y": 681.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-15",
      "label": "M15",
      "value": 200,
      "shape": "circle",
      "x": 468.5,
      "y": 681.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-25",
      "label": "M25",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 689.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-29",
      "label": "M29",
      "value": 200,
      "shape": "circle",
      "x": 935.5,
      "y": 689.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-09",
      "label": "M09",
      "value": 200,
      "shape": "circle",
      "x": 345.5,
      "y": 689.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-19",
      "label": "XS19",
      "value": 80,
      "shape": "circle",
      "x": 165.0,
      "y": 722.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-50",
      "label": "XS50",
      "value": 80,
      "shape": "circle",
      "x": 1115.0,
      "y": 722.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "S-03",
      "label": "S03",
      "value": 160,
      "shape": "circle",
      "x": 296.5,
      "y": 738.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "S-08",
      "label": "S08",
      "value": 160,
      "shape": "circle",
      "x": 984.5,
      "y": 738.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "XS-52",
      "label": "XS52",
      "value": 80,
      "shape": "circle",
      "x": 1188.5,
      "y": 746.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-18",
      "label": "XS18",
      "value": 80,
      "shape": "circle",
      "x": 92.0,
      "y": 747.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-14",
      "label": "M14",
      "value": 200,
      "shape": "circle",
      "x": 345.5,
      "y": 787.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-31",
      "label": "M31",
      "value": 200,
      "shape": "circle",
      "x": 935.0,
      "y": 787.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-33",
      "label": "M33",
      "value": 200,
      "shape": "circle",
      "x": 1033.5,
      "y": 787.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-08",
      "label": "M08",
      "value": 200,
      "shape": "circle",
      "x": 247.5,
      "y": 787.5,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-19",
      "label": "M19",
      "value": 200,
      "shape": "circle",
      "x": 574.5,
      "y": 788.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-24",
      "label": "M24",
      "value": 200,
      "shape": "circle",
      "x": 706.0,
      "y": 788.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-17",
      "label": "XS17",
      "value": 80,
      "shape": "circle",
      "x": 34.0,
      "y": 803.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-62",
      "label": "XS62",
      "value": 80,
      "shape": "circle",
      "x": 1246.0,
      "y": 804.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-24",
      "label": "XS24",
      "value": 80,
      "shape": "circle",
      "x": 198.0,
      "y": 836.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-56",
      "label": "XS56",
      "value": 80,
      "shape": "circle",
      "x": 1082.0,
      "y": 837.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-23",
      "label": "XS23",
      "value": 80,
      "shape": "circle",
      "x": 149.0,
      "y": 885.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-61",
      "label": "XS61",
      "value": 80,
      "shape": "circle",
      "x": 1132.0,
      "y": 885.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-29",
      "label": "XS29",
      "value": 80,
      "shape": "circle",
      "x": 222.0,
      "y": 910.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-23",
      "label": "M23",
      "value": 200,
      "shape": "circle",
      "x": 583.0,
      "y": 910.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-28",
      "label": "M28",
      "value": 200,
      "shape": "circle",
      "x": 697.5,
      "y": 910.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-55",
      "label": "XS55",
      "value": 80,
      "shape": "circle",
      "x": 1058.0,
      "y": 910.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-18",
      "label": "M18",
      "value": 200,
      "shape": "circle",
      "x": 476.5,
      "y": 918.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-30",
      "label": "M30",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 918.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "S-05",
      "label": "S05",
      "value": 160,
      "shape": "circle",
      "x": 534.0,
      "y": 959.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "S-07",
      "label": "S07",
      "value": 160,
      "shape": "circle",
      "x": 738.5,
      "y": 959.0,
      "group": "lair",
      "size": "S"
    },
    {
      "id": "XS-28",
      "label": "XS28",
      "value": 80,
      "shape": "circle",
      "x": 165.0,
      "y": 967.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-60",
      "label": "XS60",
      "value": 80,
      "shape": "circle",
      "x": 1115.5,
      "y": 968.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "M-22",
      "label": "M22",
      "value": 200,
      "shape": "circle",
      "x": 476.5,
      "y": 1017.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "M-32",
      "label": "M32",
      "value": 200,
      "shape": "circle",
      "x": 804.0,
      "y": 1017.0,
      "group": "lair",
      "size": "M"
    },
    {
      "id": "XS-27",
      "label": "XS27",
      "value": 80,
      "shape": "circle",
      "x": 100.0,
      "y": 1033.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-64",
      "label": "XS64",
      "value": 80,
      "shape": "circle",
      "x": 1181.0,
      "y": 1033.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-35",
      "label": "XS35",
      "value": 80,
      "shape": "circle",
      "x": 354.0,
      "y": 1042.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-54",
      "label": "XS54",
      "value": 80,
      "shape": "circle",
      "x": 926.0,
      "y": 1042.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-40",
      "label": "XS40",
      "value": 80,
      "shape": "circle",
      "x": 427.0,
      "y": 1066.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-45",
      "label": "XS45",
      "value": 80,
      "shape": "circle",
      "x": 542.0,
      "y": 1074.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-49",
      "label": "XS49",
      "value": 80,
      "shape": "circle",
      "x": 738.0,
      "y": 1074.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-53",
      "label": "XS53",
      "value": 80,
      "shape": "circle",
      "x": 861.5,
      "y": 1074.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-34",
      "label": "XS34",
      "value": 80,
      "shape": "circle",
      "x": 288.0,
      "y": 1090.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-59",
      "label": "XS59",
      "value": 80,
      "shape": "circle",
      "x": 992.0,
      "y": 1090.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-39",
      "label": "XS39",
      "value": 80,
      "shape": "circle",
      "x": 370.0,
      "y": 1123.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-58",
      "label": "XS58",
      "value": 80,
      "shape": "circle",
      "x": 918.0,
      "y": 1131.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-63",
      "label": "XS63",
      "value": 80,
      "shape": "circle",
      "x": 1058.0,
      "y": 1155.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-33",
      "label": "XS33",
      "value": 80,
      "shape": "circle",
      "x": 222.0,
      "y": 1156.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-44",
      "label": "XS44",
      "value": 80,
      "shape": "circle",
      "x": 542.0,
      "y": 1164.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-51",
      "label": "XS51",
      "value": 80,
      "shape": "circle",
      "x": 738.5,
      "y": 1164.0,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-43",
      "label": "XS43",
      "value": 80,
      "shape": "circle",
      "x": 443.5,
      "y": 1212.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "XS-57",
      "label": "XS57",
      "value": 80,
      "shape": "circle",
      "x": 844.5,
      "y": 1212.5,
      "group": "lair",
      "size": "XS"
    },
    {
      "id": "R-S-06",
      "label": "S06",
      "value": 240,
      "shape": "rect",
      "x": 639.5,
      "y": 34.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-08",
      "label": "S08",
      "value": 240,
      "shape": "rect",
      "x": 640.5,
      "y": 99.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-01",
      "label": "S01",
      "value": 240,
      "shape": "rect",
      "x": 165.5,
      "y": 148.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-18",
      "label": "S18",
      "value": 240,
      "shape": "rect",
      "x": 1115.5,
      "y": 148.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-02",
      "label": "S02",
      "value": 240,
      "shape": "rect",
      "x": 230.5,
      "y": 214.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-17",
      "label": "S17",
      "value": 240,
      "shape": "rect",
      "x": 1049.5,
      "y": 214.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-10",
      "label": "S10",
      "value": 240,
      "shape": "rect",
      "x": 598.5,
      "y": 230.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-12",
      "label": "S12",
      "value": 240,
      "shape": "rect",
      "x": 681.5,
      "y": 230.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-05",
      "label": "S05",
      "value": 240,
      "shape": "rect",
      "x": 418.5,
      "y": 271.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-14",
      "label": "S14",
      "value": 240,
      "shape": "rect",
      "x": 860.5,
      "y": 271.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-L-03",
      "label": "L03",
      "value": 480,
      "shape": "rect",
      "x": 639.5,
      "y": 295.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-01",
      "label": "L01",
      "value": 480,
      "shape": "rect",
      "x": 353.5,
      "y": 337.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-07",
      "label": "L07",
      "value": 480,
      "shape": "rect",
      "x": 926.5,
      "y": 337.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-M-01",
      "label": "M01",
      "value": 320,
      "shape": "rect",
      "x": 410.5,
      "y": 394.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-L-05",
      "label": "L05",
      "value": 480,
      "shape": "rect",
      "x": 640.5,
      "y": 394.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-M-06",
      "label": "M06",
      "value": 320,
      "shape": "rect",
      "x": 869.5,
      "y": 394.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-S-04",
      "label": "S04",
      "value": 240,
      "shape": "rect",
      "x": 288.5,
      "y": 402.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-20",
      "label": "S20",
      "value": 240,
      "shape": "rect",
      "x": 991.5,
      "y": 402.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-XL-01",
      "label": "XL01",
      "value": 800,
      "shape": "rect",
      "x": 467.5,
      "y": 451.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-06",
      "label": "XL06",
      "value": 800,
      "shape": "rect",
      "x": 812.5,
      "y": 451.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-02",
      "label": "XL02",
      "value": 800,
      "shape": "rect",
      "x": 525.5,
      "y": 509.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-05",
      "label": "XL05",
      "value": 800,
      "shape": "rect",
      "x": 754.5,
      "y": 509.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-M-02",
      "label": "M02",
      "value": 320,
      "shape": "rect",
      "x": 582.5,
      "y": 566.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-M-05",
      "label": "M05",
      "value": 320,
      "shape": "rect",
      "x": 697.5,
      "y": 566.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-S-22",
      "label": "S22",
      "value": 240,
      "shape": "rect",
      "x": 1049.5,
      "y": 574.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-09",
      "label": "S09",
      "value": 240,
      "shape": "rect",
      "x": 230.5,
      "y": 582.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-03",
      "label": "S03",
      "value": 240,
      "shape": "rect",
      "x": 34.5,
      "y": 623.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-07",
      "label": "S07",
      "value": 240,
      "shape": "rect",
      "x": 107.5,
      "y": 623.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-L-02",
      "label": "L02",
      "value": 480,
      "shape": "rect",
      "x": 312.5,
      "y": 623.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-04",
      "label": "L04",
      "value": 480,
      "shape": "rect",
      "x": 410.5,
      "y": 623.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-XXL-01",
      "label": "XXL01",
      "value": 1600,
      "shape": "rect",
      "x": 640.5,
      "y": 623.5,
      "group": "workbench",
      "size": "XXL"
    },
    {
      "id": "R-L-09",
      "label": "L09",
      "value": 480,
      "shape": "rect",
      "x": 869.5,
      "y": 623.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-11",
      "label": "L11",
      "value": 480,
      "shape": "rect",
      "x": 967.5,
      "y": 623.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-S-26",
      "label": "S26",
      "value": 240,
      "shape": "rect",
      "x": 1172.5,
      "y": 623.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-30",
      "label": "S30",
      "value": 240,
      "shape": "rect",
      "x": 1245.5,
      "y": 623.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-11",
      "label": "S11",
      "value": 240,
      "shape": "rect",
      "x": 230.5,
      "y": 664.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-24",
      "label": "S24",
      "value": 240,
      "shape": "rect",
      "x": 1049.5,
      "y": 672.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-M-04",
      "label": "M04",
      "value": 320,
      "shape": "rect",
      "x": 582.5,
      "y": 680.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-M-07",
      "label": "M07",
      "value": 320,
      "shape": "rect",
      "x": 697.5,
      "y": 680.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-XL-04",
      "label": "XL04",
      "value": 800,
      "shape": "rect",
      "x": 525.5,
      "y": 737.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-07",
      "label": "XL07",
      "value": 800,
      "shape": "rect",
      "x": 754.5,
      "y": 737.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-03",
      "label": "XL03",
      "value": 800,
      "shape": "rect",
      "x": 467.5,
      "y": 795.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-XL-08",
      "label": "XL08",
      "value": 800,
      "shape": "rect",
      "x": 812.5,
      "y": 795.5,
      "group": "workbench",
      "size": "XL"
    },
    {
      "id": "R-S-13",
      "label": "S13",
      "value": 240,
      "shape": "rect",
      "x": 288.5,
      "y": 844.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-29",
      "label": "S29",
      "value": 240,
      "shape": "rect",
      "x": 991.5,
      "y": 844.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-M-03",
      "label": "M03",
      "value": 320,
      "shape": "rect",
      "x": 410.5,
      "y": 852.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-L-08",
      "label": "L08",
      "value": 480,
      "shape": "rect",
      "x": 640.5,
      "y": 852.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-M-08",
      "label": "M08",
      "value": 320,
      "shape": "rect",
      "x": 869.5,
      "y": 852.5,
      "group": "workbench",
      "size": "M"
    },
    {
      "id": "R-L-12",
      "label": "L12",
      "value": 480,
      "shape": "rect",
      "x": 926.5,
      "y": 909.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-06",
      "label": "L06",
      "value": 480,
      "shape": "rect",
      "x": 353.5,
      "y": 910.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-L-10",
      "label": "L10",
      "value": 480,
      "shape": "rect",
      "x": 639.5,
      "y": 951.5,
      "group": "workbench",
      "size": "L"
    },
    {
      "id": "R-S-19",
      "label": "S19",
      "value": 240,
      "shape": "rect",
      "x": 418.5,
      "y": 975.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-28",
      "label": "S28",
      "value": 240,
      "shape": "rect",
      "x": 860.5,
      "y": 975.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-21",
      "label": "S21",
      "value": 240,
      "shape": "rect",
      "x": 598.5,
      "y": 1016.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-23",
      "label": "S23",
      "value": 240,
      "shape": "rect",
      "x": 681.5,
      "y": 1016.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-16",
      "label": "S16",
      "value": 240,
      "shape": "rect",
      "x": 230.5,
      "y": 1033.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-31",
      "label": "S31",
      "value": 240,
      "shape": "rect",
      "x": 1049.5,
      "y": 1033.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-15",
      "label": "S15",
      "value": 240,
      "shape": "rect",
      "x": 165.5,
      "y": 1098.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-32",
      "label": "S32",
      "value": 240,
      "shape": "rect",
      "x": 1114.5,
      "y": 1098.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-25",
      "label": "S25",
      "value": 240,
      "shape": "rect",
      "x": 640.5,
      "y": 1147.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "R-S-27",
      "label": "S27",
      "value": 240,
      "shape": "rect",
      "x": 639.5,
      "y": 1213.5,
      "group": "workbench",
      "size": "S"
    },
    {
      "id": "BASE-TL",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 280,
      "y": 34,
      "group": "base",
      "baseColor": "green",
      "size": null
    },
    {
      "id": "BASE-TR",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 1000,
      "y": 34,
      "group": "base",
      "baseColor": "green",
      "size": null
    },
    {
      "id": "BASE-L",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 34,
      "y": 295,
      "group": "base",
      "baseColor": "blue",
      "size": null
    },
    {
      "id": "BASE-R",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 1245,
      "y": 295,
      "group": "base",
      "baseColor": "purple",
      "size": null
    },
    {
      "id": "BASE-BL",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 34,
      "y": 934,
      "group": "base",
      "baseColor": "magenta",
      "size": null
    },
    {
      "id": "BASE-BR",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 1246,
      "y": 934,
      "group": "base",
      "baseColor": "red",
      "size": null
    },
    {
      "id": "BASE-BTL",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 312,
      "y": 1213,
      "group": "base",
      "baseColor": "yellow",
      "size": null
    },
    {
      "id": "BASE-BTR",
      "label": "",
      "value": null,
      "shape": "circle",
      "x": 967,
      "y": 1213,
      "group": "base",
      "baseColor": "pink",
      "size": null
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "source": "XS-08",
      "target": "XS-14"
    },
    {
      "id": "e-2",
      "source": "XS-08",
      "target": "R-S-06"
    },
    {
      "id": "e-3",
      "source": "XS-08",
      "target": "BASE-TL"
    },
    {
      "id": "e-4",
      "source": "XS-22",
      "target": "XS-21"
    },
    {
      "id": "e-5",
      "source": "XS-22",
      "target": "R-S-06"
    },
    {
      "id": "e-6",
      "source": "XS-22",
      "target": "BASE-TR"
    },
    {
      "id": "e-7",
      "source": "XS-14",
      "target": "R-S-08"
    },
    {
      "id": "e-8",
      "source": "XS-21",
      "target": "R-S-08"
    },
    {
      "id": "e-9",
      "source": "XS-02",
      "target": "XS-06"
    },
    {
      "id": "e-10",
      "source": "XS-02",
      "target": "R-S-01"
    },
    {
      "id": "e-11",
      "source": "XS-02",
      "target": "BASE-TL"
    },
    {
      "id": "e-12",
      "source": "XS-32",
      "target": "XS-31"
    },
    {
      "id": "e-13",
      "source": "XS-32",
      "target": "R-S-18"
    },
    {
      "id": "e-14",
      "source": "XS-32",
      "target": "BASE-TR"
    },
    {
      "id": "e-15",
      "source": "XS-26",
      "target": "XS-25"
    },
    {
      "id": "e-16",
      "source": "XS-26",
      "target": "BASE-TR"
    },
    {
      "id": "e-17",
      "source": "XS-07",
      "target": "XS-12"
    },
    {
      "id": "e-18",
      "source": "XS-07",
      "target": "BASE-TL"
    },
    {
      "id": "e-19",
      "source": "XS-06",
      "target": "R-S-02"
    },
    {
      "id": "e-20",
      "source": "XS-31",
      "target": "R-S-17"
    },
    {
      "id": "e-21",
      "source": "XS-16",
      "target": "R-S-08"
    },
    {
      "id": "e-22",
      "source": "XS-16",
      "target": "R-S-10"
    },
    {
      "id": "e-23",
      "source": "XS-25",
      "target": "M-13"
    },
    {
      "id": "e-24",
      "source": "XS-20",
      "target": "R-S-08"
    },
    {
      "id": "e-25",
      "source": "XS-20",
      "target": "R-S-12"
    },
    {
      "id": "e-26",
      "source": "XS-12",
      "target": "M-02"
    },
    {
      "id": "e-27",
      "source": "XS-11",
      "target": "XS-10"
    },
    {
      "id": "e-28",
      "source": "XS-11",
      "target": "R-S-05"
    },
    {
      "id": "e-29",
      "source": "XS-30",
      "target": "XS-36"
    },
    {
      "id": "e-30",
      "source": "XS-30",
      "target": "R-S-14"
    },
    {
      "id": "e-31",
      "source": "XS-01",
      "target": "XS-05"
    },
    {
      "id": "e-32",
      "source": "XS-01",
      "target": "R-S-01"
    },
    {
      "id": "e-33",
      "source": "XS-01",
      "target": "BASE-L"
    },
    {
      "id": "e-34",
      "source": "XS-38",
      "target": "XS-37"
    },
    {
      "id": "e-35",
      "source": "XS-38",
      "target": "R-S-18"
    },
    {
      "id": "e-36",
      "source": "XS-38",
      "target": "BASE-R"
    },
    {
      "id": "e-37",
      "source": "M-02",
      "target": "S-02"
    },
    {
      "id": "e-38",
      "source": "M-02",
      "target": "R-S-10"
    },
    {
      "id": "e-39",
      "source": "M-13",
      "target": "S-04"
    },
    {
      "id": "e-40",
      "source": "M-13",
      "target": "R-S-12"
    },
    {
      "id": "e-41",
      "source": "M-13",
      "target": "R-S-14"
    },
    {
      "id": "e-42",
      "source": "XS-05",
      "target": "R-S-02"
    },
    {
      "id": "e-43",
      "source": "S-02",
      "target": "M-05"
    },
    {
      "id": "e-44",
      "source": "S-02",
      "target": "M-07"
    },
    {
      "id": "e-45",
      "source": "XS-37",
      "target": "R-S-17"
    },
    {
      "id": "e-46",
      "source": "S-04",
      "target": "M-17"
    },
    {
      "id": "e-47",
      "source": "S-04",
      "target": "M-12"
    },
    {
      "id": "e-48",
      "source": "M-05",
      "target": "R-S-05"
    },
    {
      "id": "e-49",
      "source": "M-05",
      "target": "R-M-01"
    },
    {
      "id": "e-50",
      "source": "M-17",
      "target": "R-S-14"
    },
    {
      "id": "e-51",
      "source": "M-17",
      "target": "R-L-03"
    },
    {
      "id": "e-52",
      "source": "M-17",
      "target": "R-M-06"
    },
    {
      "id": "e-53",
      "source": "M-07",
      "target": "R-L-05"
    },
    {
      "id": "e-54",
      "source": "M-12",
      "target": "R-L-05"
    },
    {
      "id": "e-55",
      "source": "XS-10",
      "target": "R-S-04"
    },
    {
      "id": "e-56",
      "source": "XS-36",
      "target": "R-S-20"
    },
    {
      "id": "e-57",
      "source": "XS-04",
      "target": "XS-09"
    },
    {
      "id": "e-58",
      "source": "XS-42",
      "target": "XS-41"
    },
    {
      "id": "e-59",
      "source": "XS-09",
      "target": "M-01"
    },
    {
      "id": "e-60",
      "source": "XS-41",
      "target": "M-27"
    },
    {
      "id": "e-61",
      "source": "XS-48",
      "target": "XS-47"
    },
    {
      "id": "e-62",
      "source": "XS-48",
      "target": "R-S-30"
    },
    {
      "id": "e-63",
      "source": "XS-48",
      "target": "BASE-R"
    },
    {
      "id": "e-64",
      "source": "XS-03",
      "target": "XS-13"
    },
    {
      "id": "e-65",
      "source": "XS-03",
      "target": "R-S-03"
    },
    {
      "id": "e-66",
      "source": "XS-03",
      "target": "BASE-L"
    },
    {
      "id": "e-67",
      "source": "M-16",
      "target": "R-L-05"
    },
    {
      "id": "e-68",
      "source": "M-16",
      "target": "R-XL-05"
    },
    {
      "id": "e-69",
      "source": "M-01",
      "target": "S-01"
    },
    {
      "id": "e-70",
      "source": "M-03",
      "target": "S-01"
    },
    {
      "id": "e-71",
      "source": "M-03",
      "target": "R-M-01"
    },
    {
      "id": "e-72",
      "source": "M-03",
      "target": "R-S-04"
    },
    {
      "id": "e-73",
      "source": "M-11",
      "target": "R-L-05"
    },
    {
      "id": "e-74",
      "source": "M-11",
      "target": "R-XL-02"
    },
    {
      "id": "e-75",
      "source": "M-21",
      "target": "S-06"
    },
    {
      "id": "e-76",
      "source": "M-21",
      "target": "R-M-06"
    },
    {
      "id": "e-77",
      "source": "M-21",
      "target": "R-S-20"
    },
    {
      "id": "e-78",
      "source": "M-27",
      "target": "S-06"
    },
    {
      "id": "e-79",
      "source": "S-01",
      "target": "M-06"
    },
    {
      "id": "e-80",
      "source": "S-06",
      "target": "M-26"
    },
    {
      "id": "e-81",
      "source": "XS-15",
      "target": "R-S-09"
    },
    {
      "id": "e-82",
      "source": "XS-15",
      "target": "R-S-07"
    },
    {
      "id": "e-83",
      "source": "XS-46",
      "target": "R-S-22"
    },
    {
      "id": "e-84",
      "source": "XS-46",
      "target": "R-S-26"
    },
    {
      "id": "e-85",
      "source": "M-06",
      "target": "R-L-04"
    },
    {
      "id": "e-86",
      "source": "M-20",
      "target": "R-XL-05"
    },
    {
      "id": "e-87",
      "source": "M-20",
      "target": "R-L-09"
    },
    {
      "id": "e-88",
      "source": "M-26",
      "target": "R-L-09"
    },
    {
      "id": "e-89",
      "source": "M-10",
      "target": "R-XL-02"
    },
    {
      "id": "e-90",
      "source": "M-10",
      "target": "R-L-04"
    },
    {
      "id": "e-91",
      "source": "M-15",
      "target": "R-L-04"
    },
    {
      "id": "e-92",
      "source": "M-15",
      "target": "R-XL-04"
    },
    {
      "id": "e-93",
      "source": "M-25",
      "target": "R-L-09"
    },
    {
      "id": "e-94",
      "source": "M-25",
      "target": "R-XL-07"
    },
    {
      "id": "e-95",
      "source": "M-29",
      "target": "S-08"
    },
    {
      "id": "e-96",
      "source": "M-29",
      "target": "R-L-09"
    },
    {
      "id": "e-97",
      "source": "M-09",
      "target": "S-03"
    },
    {
      "id": "e-98",
      "source": "M-09",
      "target": "R-L-04"
    },
    {
      "id": "e-99",
      "source": "XS-19",
      "target": "R-S-07"
    },
    {
      "id": "e-100",
      "source": "XS-19",
      "target": "R-S-11"
    },
    {
      "id": "e-101",
      "source": "XS-50",
      "target": "R-S-24"
    },
    {
      "id": "e-102",
      "source": "S-03",
      "target": "M-14"
    },
    {
      "id": "e-103",
      "source": "S-03",
      "target": "M-08"
    },
    {
      "id": "e-104",
      "source": "S-08",
      "target": "M-31"
    },
    {
      "id": "e-105",
      "source": "S-08",
      "target": "M-33"
    },
    {
      "id": "e-106",
      "source": "XS-52",
      "target": "XS-62"
    },
    {
      "id": "e-107",
      "source": "XS-18",
      "target": "XS-17"
    },
    {
      "id": "e-108",
      "source": "M-14",
      "target": "R-S-13"
    },
    {
      "id": "e-109",
      "source": "M-14",
      "target": "R-M-03"
    },
    {
      "id": "e-110",
      "source": "M-31",
      "target": "R-S-29"
    },
    {
      "id": "e-111",
      "source": "M-31",
      "target": "R-M-08"
    },
    {
      "id": "e-112",
      "source": "M-33",
      "target": "XS-56"
    },
    {
      "id": "e-113",
      "source": "M-33",
      "target": "R-S-29"
    },
    {
      "id": "e-114",
      "source": "M-08",
      "target": "XS-24"
    },
    {
      "id": "e-115",
      "source": "M-08",
      "target": "R-S-13"
    },
    {
      "id": "e-116",
      "source": "M-19",
      "target": "R-XL-04"
    },
    {
      "id": "e-117",
      "source": "M-19",
      "target": "R-L-08"
    },
    {
      "id": "e-118",
      "source": "M-24",
      "target": "R-XL-07"
    },
    {
      "id": "e-119",
      "source": "M-24",
      "target": "R-L-08"
    },
    {
      "id": "e-120",
      "source": "XS-17",
      "target": "R-S-03"
    },
    {
      "id": "e-121",
      "source": "XS-17",
      "target": "BASE-BL"
    },
    {
      "id": "e-122",
      "source": "XS-62",
      "target": "R-S-30"
    },
    {
      "id": "e-123",
      "source": "XS-62",
      "target": "BASE-BR"
    },
    {
      "id": "e-124",
      "source": "XS-24",
      "target": "XS-23"
    },
    {
      "id": "e-125",
      "source": "XS-56",
      "target": "XS-61"
    },
    {
      "id": "e-126",
      "source": "XS-29",
      "target": "XS-35"
    },
    {
      "id": "e-127",
      "source": "XS-29",
      "target": "R-S-13"
    },
    {
      "id": "e-128",
      "source": "M-23",
      "target": "S-05"
    },
    {
      "id": "e-129",
      "source": "M-23",
      "target": "R-L-08"
    },
    {
      "id": "e-130",
      "source": "M-23",
      "target": "R-L-10"
    },
    {
      "id": "e-131",
      "source": "M-28",
      "target": "R-L-08"
    },
    {
      "id": "e-132",
      "source": "XS-55",
      "target": "XS-54"
    },
    {
      "id": "e-133",
      "source": "XS-55",
      "target": "R-S-29"
    },
    {
      "id": "e-134",
      "source": "M-18",
      "target": "S-05"
    },
    {
      "id": "e-135",
      "source": "M-18",
      "target": "R-M-03"
    },
    {
      "id": "e-136",
      "source": "M-18",
      "target": "R-L-10"
    },
    {
      "id": "e-137",
      "source": "M-18",
      "target": "R-S-19"
    },
    {
      "id": "e-138",
      "source": "M-30",
      "target": "S-07"
    },
    {
      "id": "e-139",
      "source": "M-30",
      "target": "R-M-08"
    },
    {
      "id": "e-140",
      "source": "M-30",
      "target": "R-S-28"
    },
    {
      "id": "e-141",
      "source": "S-05",
      "target": "M-22"
    },
    {
      "id": "e-142",
      "source": "S-07",
      "target": "M-32"
    },
    {
      "id": "e-143",
      "source": "XS-28",
      "target": "XS-27"
    },
    {
      "id": "e-144",
      "source": "XS-28",
      "target": "R-S-16"
    },
    {
      "id": "e-145",
      "source": "XS-60",
      "target": "XS-64"
    },
    {
      "id": "e-146",
      "source": "XS-60",
      "target": "R-S-31"
    },
    {
      "id": "e-147",
      "source": "M-22",
      "target": "XS-40"
    },
    {
      "id": "e-148",
      "source": "M-22",
      "target": "R-S-19"
    },
    {
      "id": "e-149",
      "source": "M-22",
      "target": "R-S-21"
    },
    {
      "id": "e-150",
      "source": "M-32",
      "target": "XS-53"
    },
    {
      "id": "e-151",
      "source": "M-32",
      "target": "R-S-28"
    },
    {
      "id": "e-152",
      "source": "M-32",
      "target": "R-S-23"
    },
    {
      "id": "e-153",
      "source": "XS-27",
      "target": "R-S-15"
    },
    {
      "id": "e-154",
      "source": "XS-64",
      "target": "R-S-32"
    },
    {
      "id": "e-155",
      "source": "XS-35",
      "target": "R-S-19"
    },
    {
      "id": "e-156",
      "source": "XS-54",
      "target": "R-S-28"
    },
    {
      "id": "e-157",
      "source": "XS-40",
      "target": "XS-39"
    },
    {
      "id": "e-158",
      "source": "XS-45",
      "target": "R-S-21"
    },
    {
      "id": "e-159",
      "source": "XS-45",
      "target": "R-S-25"
    },
    {
      "id": "e-160",
      "source": "XS-49",
      "target": "R-S-23"
    },
    {
      "id": "e-161",
      "source": "XS-53",
      "target": "XS-58"
    },
    {
      "id": "e-162",
      "source": "XS-34",
      "target": "XS-33"
    },
    {
      "id": "e-163",
      "source": "XS-34",
      "target": "R-S-16"
    },
    {
      "id": "e-164",
      "source": "XS-59",
      "target": "XS-63"
    },
    {
      "id": "e-165",
      "source": "XS-59",
      "target": "R-S-31"
    },
    {
      "id": "e-166",
      "source": "XS-63",
      "target": "R-S-32"
    },
    {
      "id": "e-167",
      "source": "XS-33",
      "target": "R-S-15"
    },
    {
      "id": "e-168",
      "source": "XS-43",
      "target": "R-S-27"
    },
    {
      "id": "e-169",
      "source": "XS-43",
      "target": "BASE-BTL"
    },
    {
      "id": "e-170",
      "source": "XS-57",
      "target": "R-S-27"
    },
    {
      "id": "e-171",
      "source": "XS-57",
      "target": "BASE-BTR"
    },
    {
      "id": "e-172",
      "source": "R-S-01",
      "target": "R-S-02"
    },
    {
      "id": "e-173",
      "source": "R-S-18",
      "target": "R-S-17"
    },
    {
      "id": "e-174",
      "source": "R-S-10",
      "target": "R-L-03"
    },
    {
      "id": "e-175",
      "source": "R-S-12",
      "target": "R-L-03"
    },
    {
      "id": "e-176",
      "source": "R-S-05",
      "target": "R-L-01"
    },
    {
      "id": "e-177",
      "source": "R-S-14",
      "target": "R-L-07"
    },
    {
      "id": "e-178",
      "source": "R-L-01",
      "target": "R-M-01"
    },
    {
      "id": "e-179",
      "source": "R-L-01",
      "target": "R-S-04"
    },
    {
      "id": "e-180",
      "source": "R-L-07",
      "target": "R-M-06"
    },
    {
      "id": "e-181",
      "source": "R-L-07",
      "target": "R-S-20"
    },
    {
      "id": "e-182",
      "source": "R-M-01",
      "target": "R-XL-01"
    },
    {
      "id": "e-183",
      "source": "R-M-06",
      "target": "R-XL-06"
    },
    {
      "id": "e-184",
      "source": "R-XL-01",
      "target": "R-XL-02"
    },
    {
      "id": "e-185",
      "source": "R-XL-06",
      "target": "R-XL-05"
    },
    {
      "id": "e-186",
      "source": "R-XL-02",
      "target": "R-M-02"
    },
    {
      "id": "e-187",
      "source": "R-XL-05",
      "target": "R-M-05"
    },
    {
      "id": "e-188",
      "source": "R-M-02",
      "target": "R-XXL-01"
    },
    {
      "id": "e-189",
      "source": "R-M-05",
      "target": "R-XXL-01"
    },
    {
      "id": "e-190",
      "source": "R-S-22",
      "target": "R-L-11"
    },
    {
      "id": "e-191",
      "source": "R-S-09",
      "target": "R-L-02"
    },
    {
      "id": "e-192",
      "source": "R-L-02",
      "target": "R-S-11"
    },
    {
      "id": "e-193",
      "source": "R-XXL-01",
      "target": "R-M-04"
    },
    {
      "id": "e-194",
      "source": "R-XXL-01",
      "target": "R-M-07"
    },
    {
      "id": "e-195",
      "source": "R-L-11",
      "target": "R-S-24"
    },
    {
      "id": "e-196",
      "source": "R-M-04",
      "target": "R-XL-04"
    },
    {
      "id": "e-197",
      "source": "R-M-07",
      "target": "R-XL-07"
    },
    {
      "id": "e-198",
      "source": "R-XL-04",
      "target": "R-XL-03"
    },
    {
      "id": "e-199",
      "source": "R-XL-07",
      "target": "R-XL-08"
    },
    {
      "id": "e-200",
      "source": "R-XL-03",
      "target": "R-M-03"
    },
    {
      "id": "e-201",
      "source": "R-XL-08",
      "target": "R-M-08"
    },
    {
      "id": "e-202",
      "source": "R-S-13",
      "target": "R-L-06"
    },
    {
      "id": "e-203",
      "source": "R-S-29",
      "target": "R-L-12"
    },
    {
      "id": "e-204",
      "source": "R-M-03",
      "target": "R-L-06"
    },
    {
      "id": "e-205",
      "source": "R-M-08",
      "target": "R-L-12"
    },
    {
      "id": "e-206",
      "source": "R-L-12",
      "target": "R-S-28"
    },
    {
      "id": "e-207",
      "source": "R-L-06",
      "target": "R-S-19"
    },
    {
      "id": "e-208",
      "source": "R-L-10",
      "target": "R-S-21"
    },
    {
      "id": "e-209",
      "source": "R-L-10",
      "target": "R-S-23"
    },
    {
      "id": "e-210",
      "source": "R-S-16",
      "target": "R-S-15"
    },
    {
      "id": "e-211",
      "source": "R-S-31",
      "target": "R-S-32"
    },
    {
      "id": "e-212",
      "source": "XS-44",
      "target": "R-S-25"
    },
    {
      "id": "e-213",
      "source": "XS-51",
      "target": "R-S-25"
    },
    {
      "id": "e-214",
      "source": "M-04",
      "target": "R-XXL-01"
    },
    {
      "id": "e-215",
      "source": "M-04",
      "target": "R-XL-04"
    }
  ]
};

export const nodeById = new Map(mapGraph.nodes.map((node) => [node.id, node]));

export function getEdgePoints(edge: GraphEdge): [number, number, number, number] {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) {
    throw new Error(`Broken edge ${edge.id}: ${edge.source} -> ${edge.target}`);
  }
  return [source.x, source.y, target.x, target.y];
}

export function scaleGraph(stageWidth: number, stageHeight: number) {
  return {
    scaleX: stageWidth / mapGraph.width,
    scaleY: stageHeight / mapGraph.height,
  };
}
