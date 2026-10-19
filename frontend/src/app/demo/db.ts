// In-browser database for demo mode. Holds every table as an array of rows,
// starts from the sample data in data/seed.ts and saves changes to
// localStorage so additions and deletions survive a page reload.
import { SCHEMA, Row, TableName, Tables } from './data/schema';
import { buildSeed } from './data/seed';
import { daysBetween, resetBase, shiftDays, today } from './data/time';

const STORAGE_KEY = 'dental-his-demo-db';
const VERSION = 1;

// Dates that describe fixed facts and must not move when the demo is shifted
// forward to a new day (all other dates move so "today" stays today).
const FIXED_DATE_COLUMNS = new Set(['date_of_birth', 'hire_date', 'termination_date', 'start_date', 'end_date']);

interface Snapshot {
  version: number;
  seededOn: string;
  sequences: Record<string, number>;
  tables: Tables;
}

export class DemoDb {
  tables!: Tables;
  private sequences!: Record<string, number>;
  private seededOn!: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.load()) this.reset();
  }

  /** Throws away all changes and reloads the sample data. */
  reset(): void {
    resetBase();
    const { tables, sequences } = buildSeed();
    for (const name of Object.keys(SCHEMA) as TableName[]) {
      tables[name] = (tables[name] ?? []).map(row => this.complete(name, row));
    }
    this.tables = tables;
    this.sequences = { ...sequences };
    this.seededOn = today();
    this.saveNow();
  }

  /** Inserts a row, filling in identity, defaults and NULLs like SQL Server would. */
  insert(table: TableName, values: Row): Row {
    const def = SCHEMA[table];
    const row = this.complete(table, values);
    if (def.identity && (values[def.identity] === undefined || values[def.identity] === null)) {
      row[def.identity] = this.nextId(table);
    }
    this.tables[table].push(row);
    this.save();
    return row;
  }

  /** Removes the rows matching `predicate`; returns how many were removed. */
  delete(table: TableName, predicate: (row: Row) => boolean): number {
    const before = this.tables[table].length;
    this.tables[table] = this.tables[table].filter(row => !predicate(row));
    const removed = before - this.tables[table].length;
    if (removed) this.save();
    return removed;
  }

  /** Call after mutating rows in place. */
  save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 50);
  }

  private nextId(table: TableName): number {
    const id = this.sequences[table] ?? 1;
    this.sequences[table] = id + 1;
    return id;
  }

  private complete(table: TableName, values: Row): Row {
    const def = SCHEMA[table] as { columns: Record<string, string>; defaults: Record<string, () => unknown> };
    const row: Row = {};
    for (const col of Object.keys(def.columns)) {
      if (values[col] !== undefined) row[col] = values[col];
      else row[col] = def.defaults[col] ? def.defaults[col]() : null;
    }
    return row;
  }

  private load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw) as Snapshot;
      if (saved.version !== VERSION || !saved.tables) return false;
      this.tables = saved.tables;
      this.sequences = saved.sequences;
      this.seededOn = saved.seededOn;
      const days = daysBetween(this.seededOn, today());
      if (days !== 0) this.shiftForward(days);
      return true;
    } catch {
      return false;
    }
  }

  // Moves every activity date by `days` so the demo keeps looking current.
  private shiftForward(days: number): void {
    for (const name of Object.keys(SCHEMA) as TableName[]) {
      const columns = (SCHEMA[name] as { columns: Record<string, string> }).columns;
      const dateCols = Object.keys(columns).filter(
        c => (columns[c] === 'datetime' || columns[c] === 'date') && !FIXED_DATE_COLUMNS.has(c),
      );
      for (const row of this.tables[name] ?? []) {
        for (const c of dateCols) {
          if (typeof row[c] === 'string') row[c] = shiftDays(row[c], days);
        }
      }
    }
    this.seededOn = today();
    this.saveNow();
  }

  private saveNow(): void {
    try {
      const snapshot: Snapshot = {
        version: VERSION,
        seededOn: this.seededOn,
        sequences: this.sequences,
        tables: this.tables,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full or blocked (private mode): the demo keeps working in memory.
    }
  }
}
