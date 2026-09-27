import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import type { DocumentProposal } from '@/lib/ai/prompt';

export interface ParsedChatResponse {
  reply: string;
  draft: string | null;
  proposal: DocumentProposal | null;
}

/** Parses the chat response protocol, dropping malformed document blocks. */
export function parseChatResponse(raw: string): ParsedChatResponse {
  const replyMatch = raw.match(/\[REPLY\]([\s\S]*?)(?:\[\/REPLY\]|\[DRAFT\]|\[DOCUMENT\]|$)/);
  const reply = (replyMatch ? replyMatch[1] : raw).trim();
  const draftMatch = raw.match(/\[DRAFT\]([\s\S]*?)\[\/DRAFT\]/);
  const draft = draftMatch ? draftMatch[1].trim() || null : null;
  const docMatch = raw.match(/\[DOCUMENT\]([\s\S]*?)\[\/DOCUMENT\]/);
  let proposal: DocumentProposal | null = null;
  if (docMatch) {
    const block = docMatch[1];
    const category = block.match(/카테고리:\s*(.+)/)?.[1]?.trim();
    const name = block.match(/이름:\s*(.+)/)?.[1]?.trim();
    const content = block.match(/내용:\s*([\s\S]*)/)?.[1]?.trim();
    if (category && name && content && KB_CATEGORIES.includes(category as KbCategory)) {
      proposal = { category: category as KbCategory, name, content };
    }
  }
  return { reply, draft, proposal };
}
