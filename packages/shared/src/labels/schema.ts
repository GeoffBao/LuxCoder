import { z } from 'zod';

export const WORKSPACE_LABEL_CONFIG_SCHEMA_VERSION = 1 as const;

export const WorkspaceLabelColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Label color 必须是 #RRGGBB');

export const WorkspaceLabelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  color: WorkspaceLabelColorSchema.optional(),
  archivedAt: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export const WorkspaceLabelConfigSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_LABEL_CONFIG_SCHEMA_VERSION),
  labels: z.array(WorkspaceLabelSchema),
}).strict().superRefine((config, ctx) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, label] of config.labels.entries()) {
    if (ids.has(label.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['labels', index, 'id'], message: 'Label id 必须唯一' });
    }
    ids.add(label.id);
    const normalizedName = label.name.trim().toLocaleLowerCase();
    if (names.has(normalizedName)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['labels', index, 'name'], message: 'Label name 必须大小写不敏感唯一' });
    }
    names.add(normalizedName);
  }
});

export type WorkspaceLabel = z.infer<typeof WorkspaceLabelSchema>;
export type WorkspaceLabelConfig = z.infer<typeof WorkspaceLabelConfigSchema>;

export type WorkspaceLabelConfigLoadResult =
  | { kind: 'missing'; config: WorkspaceLabelConfig }
  | { kind: 'valid'; config: WorkspaceLabelConfig }
  | { kind: 'invalid'; message: string }
  | { kind: 'unsupported'; schemaVersion: number };
