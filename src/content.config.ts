import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				// Doc content version, e.g. "1.2.0". Translations are compared
				// against the English version of the same page: a mismatch marks
				// the translation as outdated on the status page and banner.
				version: z.coerce.string().optional(),
			}),
		}),
	}),
};
