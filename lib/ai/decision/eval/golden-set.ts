import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { KB_CATEGORIES } from '@/lib/kb/categories';
export const GOLDEN_SET_FILE='lib/ai/decision/eval/golden-set.v1.jsonl';
export const FOLDER_TEMPLATE_SET_FILE='lib/ai/decision/eval/folder-template-set.v1.jsonl';
const state=z.object({userRequest:z.string(),chapterContext:z.string(),mentionedFacts:z.array(z.string())});
const common={id:z.string().min(1),split:z.enum(['calibration','holdout']),difficulty:z.enum(['easy','medium','hard']),tags:z.array(z.string()).min(1),rationale:z.string().min(10),reviewer:z.string().min(1)};
export const GoldenItemSchema=z.object({...common,state,expectedTask:z.enum(['reply','draft','document','clarify']),expectedCategory:z.enum(KB_CATEGORIES).optional()});
export const FolderTemplateItemSchema=z.object({...common,category:z.enum(KB_CATEGORIES),state,folders:z.array(z.object({id:z.string(),name:z.string(),isRoot:z.boolean(),path:z.string(),version:z.string()})),templates:z.array(z.object({id:z.string().nullable(),name:z.string(),scope:z.enum(['work','account_template','canonical']),content:z.string(),isDefault:z.boolean()})),expectedFolderId:z.string(),expectedTemplateId:z.string().nullable()});
export type GoldenItem=z.infer<typeof GoldenItemSchema>;
export type FolderTemplateItem=z.infer<typeof FolderTemplateItemSchema>;
function readJsonl<T>(root:string,file:string,schema:z.ZodType<T>):T[]{return readFileSync(path.join(root,file),'utf8').split(/\r?\n/).flatMap((line,i)=>{if(!line.trim())return[];let raw:unknown;try{raw=JSON.parse(line)}catch(e){throw new Error(`${file}:${i+1}: invalid JSON`,{cause:e})}const p=schema.safeParse(raw);if(!p.success)throw new Error(`${file}:${i+1}: ${p.error.message}`);return[p.data]})}
export const loadGoldenSet=(root=process.cwd())=>readJsonl(root,GOLDEN_SET_FILE,GoldenItemSchema);
export const loadFolderTemplateSet=(root=process.cwd())=>readJsonl(root,FOLDER_TEMPLATE_SET_FILE,FolderTemplateItemSchema);
export function datasetHash(root=process.cwd()):string{return createHash('sha256').update(readFileSync(path.join(root,GOLDEN_SET_FILE))).update('\n--\n').update(readFileSync(path.join(root,FOLDER_TEMPLATE_SET_FILE))).digest('hex')}
