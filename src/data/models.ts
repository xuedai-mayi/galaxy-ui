import { z } from 'zod';
import type { GalaxyModel } from '../galaxy-layout';

export const DOMAIN_NAMES = [
  '生态/植被', '水文/洪水', '未标注', '气候/气象', '遥感/影像',
  '地形/地貌', '农业', '土壤/侵蚀', '海洋/海岸', '社会经济',
  '其他', '空气质量', '城市', '土地利用', '地下水',
] as const;

export const modelsSchema = z.array(z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domain: z.enum(DOMAIN_NAMES),
  task: z.string().trim().min(1),
  year: z.number().int().nullable(),
  interface_count: z.number().int().nonnegative(),
  reviewed: z.boolean(),
})).min(1, '请至少提供一条记录。').superRefine((models, context) => {
  const ids = new Set<string>();
  models.forEach((model, index) => {
    if (ids.has(model.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'id 必须唯一。' });
    ids.add(model.id);
  });
});

/** Validate external JSON before it reaches the layouts and renderer. */
export function parseModels(value: unknown): GalaxyModel[] {
  return modelsSchema.parse(value);
}
