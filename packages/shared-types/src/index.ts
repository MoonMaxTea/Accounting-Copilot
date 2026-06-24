import { z } from 'zod';

export const FrameworkSchema = z.enum([
  'IFRS', 'IAS', 'ASC',       // accounting-standards
  'HK', 'SEC',                 // listing-rules
  'CN', 'DE', 'US', 'INTL',   // tax
]);
export const StatusSchema = z.enum(['current', 'legacy']);

export const RegistryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  title_zh: z.string().optional(),
  category: z.string().optional(),
  framework: FrameworkSchema,
  status: StatusSchema,
  legacy_label: z.string().optional(),
  effective_from: z.string().optional(),
  effective_until: z.string().optional(),
  superseded_by: z.string().optional(),
  supersedes: z.array(z.string()).optional(),
  official_url: z.string().url(),
  official_url_note: z.string().optional(),
  vault_path: z.string().min(1),
  pack_filename: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;
export type Status = z.infer<typeof StatusSchema>;

export const ParagraphEntrySchema = z.object({
  standard_id: z.string(),
  paragraph: z.string(),
  paragraph_normalized: z.string(),
  pack_path: z.string(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  snippet_en: z.string(),
  status: StatusSchema,
});

export type ParagraphEntry = z.infer<typeof ParagraphEntrySchema>;

export interface CopiedStandardFile {
  entry: RegistryEntry;
  packPath: string;
  absolutePath: string;
  content: string;
}

export interface SearchDocument {
  pack_path: string;
  standard_id: string;
  title: string;
  body: string;
}

export interface SearchHit {
  standard_id: string;
  pack_path: string;
  title: string;
  snippet: string;
}

export interface PackBuildResult {
  zipPath: string;
  sha256: string;
  sizeBytes: number;
  contentVersion: string;
}
