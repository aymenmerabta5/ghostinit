/** Shared data-access model; generated Convex functions retain all business policy. */
export function convexMemoryClassesSource(tables: readonly string[]): string {
  return `class MemoryDb {
  readonly #tables: Map<string, Map<string, Record<string, unknown>>>;
  readonly #nextIds = new Map<string, number>();
  #clock = 1;

  constructor(tables: readonly string[] = ${JSON.stringify(tables)}) {
    this.#tables = new Map(tables.map(table => [table, new Map()]));
  }

  tableRows(table: string): Map<string, Record<string, unknown>> {
    const rows = this.#tables.get(table);
    if (!rows) throw new Error("Unexpected table " + table);
    return rows;
  }

  rows(table: string): Record<string, unknown>[] {
    return [...this.tableRows(table).values()].map((row) => structuredClone(row));
  }

  query(table: string): MemoryQuery {
    this.tableRows(table);
    return new MemoryQuery(this, table);
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const rows = this.tableRows(table);
    const next = (this.#nextIds.get(table) ?? 0) + 1;
    this.#nextIds.set(table, next);
    const id = table + ":" + next;
    rows.set(id, { _id: id, _creationTime: this.#clock++, ...structuredClone(value) });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = this.findStoredRow(id);
    for (const [key, nextValue] of Object.entries(value)) {
      if (nextValue === undefined) delete row[key];
      else row[key] = structuredClone(nextValue);
    }
  }

  async delete(id: string): Promise<void> {
    for (const rows of this.#tables.values()) {
      if (rows.delete(id)) return;
    }
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    for (const rows of this.#tables.values()) {
      const row = rows.get(id);
      if (row) return structuredClone(row);
    }
    return null;
  }

  private findStoredRow(id: string): Record<string, unknown> {
    for (const rows of this.#tables.values()) {
      const row = rows.get(id);
      if (row) return row;
    }
    throw new Error("Missing row " + id);
  }
}

class MemoryQuery {
  readonly #filters: IndexFilter[] = [];
  #direction: "asc" | "desc" = "asc";

  constructor(
    private readonly db: MemoryDb,
    private readonly table: string,
  ) {}

  withIndex(index: string, configure: (query: IndexBuilder) => IndexBuilder): MemoryQuery {
    const allowedFields = indexFields.get(this.table + ":" + index);
    if (!allowedFields) throw new Error("Unexpected index " + this.table + ":" + index);
    const builder: IndexBuilder = {
      eq: (field, value) => {
        if (!allowedFields.includes(field)) {
          throw new Error("Unexpected indexed field " + this.table + ":" + index + ":" + field);
        }
        this.#filters.push({ field, value });
        return builder;
      },
    };
    configure(builder);
    return this;
  }

  order(direction: "asc" | "desc"): MemoryQuery {
    this.#direction = direction;
    return this;
  }

  async unique(): Promise<Record<string, unknown> | null> {
    const rows = this.matchingRows();
    if (rows.length > 1) throw new Error("Expected unique result");
    return rows[0] ?? null;
  }

  async first(): Promise<Record<string, unknown> | null> {
    return this.matchingRows()[0] ?? null;
  }

  async collect(): Promise<Record<string, unknown>[]> {
    return this.matchingRows();
  }

  async paginate(_options: unknown) {
    return { page: this.matchingRows(), isDone: true, continueCursor: "" };
  }

  private matchingRows(): Record<string, unknown>[] {
    const rows = this.db
      .rows(this.table)
      .filter((row) => this.#filters.every((filter) => row[filter.field] === filter.value));
    return rows.sort((left, right) => {
      const leftValue = numericSortValue(left);
      const rightValue = numericSortValue(right);
      return this.#direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
    });
  }
}

function numericSortValue(row: Record<string, unknown>): number {
  if (typeof row.createdAt === "number") return row.createdAt;
  return typeof row._creationTime === "number" ? row._creationTime : 0;
}
`;
}
