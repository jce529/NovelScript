// In-memory stand-in for the browser-session Supabase client used by
// lib/proposals/{queries,actions}.ts unit tests. Supports only the query
// builder surface those modules use. RLS is NOT modelled: tests seed rows for
// several owners and assert that the module's own filters keep them apart.
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface RpcCall { name: string; args: Record<string, unknown> }
export type RpcHandler = (args: Record<string, unknown>) =>
  { data?: unknown; error?: { message: string; code?: string } | null };

const time = (value: unknown) => Date.parse(String(value));

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private single = false;

  constructor(private readonly fake: FakeSupabase, private readonly table: string) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => r[column] !== value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.includes(r[column])); return this; }
  is(column: string, value: null) { this.filters.push((r) => (r[column] ?? null) === value); return this; }
  gt(column: string, value: unknown) { this.filters.push((r) => time(r[column]) > time(value)); return this; }
  lte(column: string, value: unknown) { this.filters.push((r) => time(r[column]) <= time(value)); return this; }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.single = true; return this; }

  private run(): { data: unknown; error: unknown } {
    const failure = this.fake.failTables.get(this.table);
    if (failure) return { data: null, error: { message: failure } };
    let rows = (this.fake.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (time(a[column]) - time(b[column])) * (ascending ? 1 : -1));
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    rows = rows.map((r) => ({ ...r }));
    if (this.single) {
      if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  failTables = new Map<string, string>();
  fromCalls: string[] = [];
  rpcCalls: RpcCall[] = [];
  rpcHandlers = new Map<string, RpcHandler>();

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables;
  }

  from(table: string) {
    this.fromCalls.push(table);
    return new Query(this, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcHandlers.get(name);
    if (!handler) return { data: null, error: { message: `no handler for ${name}` } };
    const out = handler(args);
    return { data: out.data ?? null, error: out.error ?? null };
  }

  /** Cast for passing to code typed against SupabaseClient. */
  get client(): never {
    return this as never;
  }
}
