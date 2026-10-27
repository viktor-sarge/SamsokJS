import { z } from 'zod';

export const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const httpUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Expected an absolute HTTP(S) URL without credentials');

const templateSchema = httpUrlSchema.refine(
  (value) => value.includes('@QUERY@'),
  'Search URLs must contain @QUERY@',
);

const sourceFields = {
  name: z.string().trim().min(1),
  catalogueUrl: templateSchema,
};

export const sourceSchema = z.discriminatedUnion('adapter', [z.strictObject({
  ...sourceFields,
  adapter: z.literal('libris-xsearch'),
  searchUrl: templateSchema,
  encoding: z.literal('utf-8'),
}), z.strictObject({
  ...sourceFields,
  adapter: z.literal('vega'),
  apiUrl: httpUrlSchema,
  customerDomain: z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  pageSize: z.number().int().min(1).max(40),
}), z.strictObject({
  ...sourceFields,
  adapter: z.literal('koha'),
  searchUrl: templateSchema,
  encoding: z.literal('utf-8'),
})]);

export const instanceSchema = z.strictObject({
  id: idSchema,
  locale: z.literal('sv'),
  branding: z.strictObject({
    title: z.string().trim().min(1),
    subtitle: z.string().trim().min(1),
  }),
  proxy: z.strictObject({
    url: httpUrlSchema,
    protocol: z.literal('legacy-jsonp'),
    timeoutMs: z.number().int().min(1000).max(120000),
  }),
  sourceGroups: z.array(z.strictObject({
    id: idSchema,
    label: z.string().trim().min(1),
    sources: z.array(idSchema).min(1),
  })).min(1),
  defaultSelectedSources: z.array(idSchema),
  theme: idSchema,
  content: z.strictObject({
    intro: z.string().trim().min(1),
    about: z.string().trim().min(1),
  }),
});

export type Source = z.infer<typeof sourceSchema> & { id: string };
export type Instance = z.infer<typeof instanceSchema> & { sources: Source[] };

export function resolveInstance(input: unknown, registryInput: unknown): Instance {
  const instance = instanceSchema.parse(input);
  const registry = z.record(idSchema, sourceSchema).parse(registryInput);
  const groupIds = instance.sourceGroups.map((group) => group.id);
  if (new Set(groupIds).size !== groupIds.length) {
    throw new Error('Instance contains duplicate group IDs');
  }
  for (const group of instance.sourceGroups) {
    if (new Set(group.sources).size !== group.sources.length) {
      throw new Error(`Group "${group.id}" contains duplicate source IDs`);
    }
  }
  const sourceIds = [...new Set(instance.sourceGroups.flatMap((group) => group.sources))];
  const sources = sourceIds.map((id) => {
    if (!Object.hasOwn(registry, id)) {
      throw new Error(`Unknown source "${id}" in instance "${instance.id}"`);
    }
    return { ...registry[id], id };
  });
  for (const id of instance.defaultSelectedSources) {
    if (!sourceIds.includes(id)) {
      throw new Error(`Default source "${id}" is not included in instance "${instance.id}"`);
    }
  }
  if (new Set(instance.defaultSelectedSources).size !== instance.defaultSelectedSources.length) {
    throw new Error('Instance contains duplicate default source IDs');
  }
  return { ...instance, sources };
}
