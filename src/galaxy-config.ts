interface DomainAnchor {
  name: string;
  x: number;
  y: number;
  z: number;
  color: string;
  tiltX: number;
  tiltY: number;
  rotation: number;
  arms: number;
  thickness: number;
}

// Fixed irregular centres, composed by seeded Poisson separation (seed 31033).
// The current catalogue's projected envelopes are disjoint when viewed along Z.
// Depth and independent disc orientations give rotation a genuine volume view.
export const DOMAIN_ANCHORS: readonly DomainAnchor[] = [
  { name: '生态/植被', x: -527, y: -43, z: 288, color: '#93c4b4', tiltX: 0.50, tiltY: -0.24, rotation: 0.63, arms: 3, thickness: 0.055 },
  { name: '水文/洪水', x: 152, y: 164, z: -308, color: '#93bdd2', tiltX: -0.31, tiltY: 0.69, rotation: 2.13, arms: 4, thickness: 0.045 },
  { name: '未标注', x: -204, y: 480, z: -366, color: '#a1b0b8', tiltX: 0.76, tiltY: 0.18, rotation: -1.07, arms: 2, thickness: 0.070 },
  { name: '气候/气象', x: 639, y: 302, z: -176, color: '#b1b6d5', tiltX: -0.59, tiltY: -0.36, rotation: 1.08, arms: 3, thickness: 0.050 },
  { name: '遥感/影像', x: 88, y: -387, z: 176, color: '#99bac8', tiltX: 0.24, tiltY: 0.44, rotation: -0.43, arms: 4, thickness: 0.060 },
  { name: '地形/地貌', x: -597, y: 345, z: -122, color: '#c9c2a5', tiltX: 0.93, tiltY: -0.22, rotation: 2.84, arms: 2, thickness: 0.055 },
  { name: '农业', x: 746, y: 33, z: -329, color: '#adbf9a', tiltX: -0.39, tiltY: 0.48, rotation: -2.32, arms: 3, thickness: 0.060 },
  { name: '土壤/侵蚀', x: 701, y: -333, z: -232, color: '#c8b5a0', tiltX: 0.70, tiltY: -0.47, rotation: 0.34, arms: 2, thickness: 0.045 },
  { name: '海洋/海岸', x: 501, y: -119, z: 67, color: '#89c5c7', tiltX: -0.80, tiltY: 0.21, rotation: 1.73, arms: 4, thickness: 0.055 },
  { name: '社会经济', x: -39, y: -173, z: -164, color: '#b3aec4', tiltX: 0.28, tiltY: -0.65, rotation: -1.68, arms: 2, thickness: 0.075 },
  { name: '其他', x: 331, y: 427, z: 292, color: '#a4b9ba', tiltX: 0.58, tiltY: 0.36, rotation: 2.37, arms: 3, thickness: 0.065 },
  { name: '空气质量', x: -227, y: -420, z: 139, color: '#b7c1a8', tiltX: -0.48, tiltY: -0.27, rotation: -0.88, arms: 4, thickness: 0.050 },
  { name: '城市', x: 390, y: -412, z: -261, color: '#a4bed5', tiltX: 0.88, tiltY: 0.32, rotation: 0.96, arms: 2, thickness: 0.060 },
  { name: '土地利用', x: 261, y: -146, z: -294, color: '#9cbaab', tiltX: -0.26, tiltY: 0.57, rotation: -2.64, arms: 3, thickness: 0.055 },
  { name: '地下水', x: -606, y: -365, z: -189, color: '#8dafc9', tiltX: -0.68, tiltY: -0.41, rotation: 1.43, arms: 4, thickness: 0.070 },
];

interface FunctionAnchor {
  name: string;
  tasks: readonly string[];
  radius: number;
  halfWidth: number;
  color: string;
  speed: number;
  labelAngle: number;
}

export const FUNCTION_ANCHORS: readonly FunctionAnchor[] = [
  { name: '过程模拟', tasks: ["模拟"], radius: 405, halfWidth: 13, color: '#f2ce87', speed: 0.025, labelAngle: 0.32 },
  { name: '数值计算', tasks: ["计算"], radius: 345, halfWidth: 11, color: '#c0dbe4', speed: -0.021, labelAngle: -0.25 },
  { name: '预测预报', tasks: ["预测"], radius: 285, halfWidth: 8, color: '#cebef0', speed: 0.030, labelAngle: 0.90 },
  { name: '评价评估', tasks: ["评估"], radius: 225, halfWidth: 9, color: '#efbb8b', speed: -0.026, labelAngle: 2.25 },
  { name: '分析制图', tasks: ["分类", "制图"], radius: 165, halfWidth: 7, color: '#a7d6bf', speed: 0.037, labelAngle: 3.70 },
  { name: '优化决策', tasks: ["优化"], radius: 105, halfWidth: 6, color: '#ffedb1', speed: -0.041, labelAngle: 2.55 },
  { name: '待标注', tasks: [], radius: 475, halfWidth: 15, color: '#94a4b7', speed: 0.016, labelAngle: 3.55 },
];

export const DOMAIN_NAMES: ReadonlySet<string> = new Set(DOMAIN_ANCHORS.map(anchor => anchor.name));
// The entry with no task labels receives unclassified records.
const unclassified = FUNCTION_ANCHORS.find(anchor => anchor.tasks.length === 0);
if (!unclassified) throw new Error('A function group with an empty tasks list is required.');
export const UNCLASSIFIED_FUNCTION = unclassified.name;
const FUNCTION_BY_TASK = new Map(FUNCTION_ANCHORS.flatMap(anchor =>
  anchor.tasks.map(task => [task, anchor.name] as const)));

export function functionGroup(task: string): string {
  return FUNCTION_BY_TASK.get(task) ?? UNCLASSIFIED_FUNCTION;
}
