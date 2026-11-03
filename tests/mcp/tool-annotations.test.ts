import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

/**
 * MCP-09 registration contract (13-05). The real app/mcp/route.ts module is imported with
 * createMcpHandler replaced by a recorder, so this checks exactly what the route registers:
 * seven read-only tools, each with a title, the four read annotations and a strict input
 * schema. No network, no Supabase.
 */
type Registration = {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: z.ZodType;
    annotations?: Record<string, unknown>;
  };
  handler: unknown;
};

const recorded = vi.hoisted(() => ({ tools: [] as Registration[] }));

vi.mock('mcp-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mcp-handler')>();
  return {
    ...actual,
    createMcpHandler: (init: (server: { registerTool: (...args: unknown[]) => void }) => void) => {
      init({
        registerTool: (name: unknown, config: unknown, handler: unknown) => {
          recorded.tools.push({ name: name as string, config: config as Registration['config'], handler });
        },
      });
      return async () => new Response(null, { status: 500 });
    },
  };
});

const WORK = '55555555-5555-4555-8555-555555555555';
const CHAPTER = '66666666-6666-4666-8666-666666666666';
const NODE = '77777777-7777-4777-8777-777777777777';
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  whoami: {},
  list_works: {},
  list_chapters: { workId: WORK },
  get_chapter: { workId: WORK, chapterId: CHAPTER },
  search_kb: { workId: WORK, query: '' },
  get_kb_document: { workId: WORK, nodeId: NODE },
  get_writing_context: { workId: WORK, chapterId: CHAPTER, nodeIds: [NODE] },
};
const EXPECTED_TOOLS = Object.keys(VALID_ARGS).sort();
const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

async function registrations(): Promise<Registration[]> {
  if (recorded.tools.length === 0) await import('@/app/mcp/route');
  return recorded.tools;
}

describe('/mcp tool registrations', () => {
  it('registers exactly the seven read tools, each once', async () => {
    const tools = await registrations();
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
  });

  it('gives every tool all four read annotations with exact values', async () => {
    for (const tool of await registrations()) {
      expect(tool.config.annotations, tool.name).toEqual(READ_ANNOTATIONS);
    }
  });

  it('gives every tool a non-empty title and description and a handler', async () => {
    for (const tool of await registrations()) {
      expect(tool.config.title?.trim(), tool.name).toBeTruthy();
      expect(tool.config.description?.trim(), tool.name).toBeTruthy();
      expect(typeof tool.handler, tool.name).toBe('function');
    }
  });

  it('accepts valid arguments and rejects unknown keys (strict schemas)', async () => {
    for (const tool of await registrations()) {
      const schema = tool.config.inputSchema;
      expect(schema, tool.name).toBeDefined();
      const valid = VALID_ARGS[tool.name];
      expect(schema!.safeParse(valid).success, tool.name).toBe(true);
      // Identity must never be settable from arguments.
      expect(schema!.safeParse({ ...valid, userId: WORK }).success, `${tool.name} userId`).toBe(false);
      expect(schema!.safeParse({ ...valid, ownerId: WORK }).success, `${tool.name} ownerId`).toBe(false);
    }
  });
});
