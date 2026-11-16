import { z } from 'zod';
import type { GalaxyModel } from '../galaxy-layout';

import { DOMAIN_NAMES } from '../galaxy-config';

export const modelsSchema = z.array(z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domain: z.string().refine(value => DOMAIN_NAMES.has(value), '未知领域，请检查 galaxy-config.ts。'),
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
