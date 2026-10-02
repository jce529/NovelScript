/** Client-safe limits/types for local files the writer uploads in the AI 패널. */
export interface ChatAttachment { name: string; content: string }

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_CHARS = 30000;

/** KB 일괄 가져오기 한도 — 한 번에 올릴 수 있는 파일 수 / 파일당 글자 수. */
export const MAX_IMPORT_FILES = 50;
export const MAX_IMPORT_CHARS = 100000;

export const ACCEPTED_TEXT_EXTENSIONS = ['.md', '.markdown', '.txt'];

export function isAcceptedTextFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** '인물/아서.md' → '아서' (KB 문서 이름은 확장자·경로 없이). */
export function documentNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.(md|markdown|txt)$/i, '').trim();
}
