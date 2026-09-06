import type { ReactNode } from "react";

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
}

export interface TableProps {
  columns: TableColumn[];
  rows: Record<string, ReactNode>[];
}

const ALIGN_CLASSES: Record<NonNullable<TableColumn["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Table({ columns = [], rows = [] }: TableProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] font-sans">
      <div className="flex border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-2.5">
        {columns.map((column) => (
          <div
            key={column.key}
            style={{ flex: column.width || 1 }}
            className={`text-[length:var(--text-xs)] font-[var(--weight-semibold)] tracking-[var(--tracking-wider)] text-[var(--text-tertiary)] uppercase ${
              ALIGN_CLASSES[column.align ?? "left"]
            }`}
          >
            {column.label}
          </div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex px-4 py-3 ${
            i < rows.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
          }`}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              style={{ flex: column.width || 1 }}
              className={`text-[length:var(--text-base)] text-[var(--text-primary)] [font-variant-numeric:tabular-nums] ${
                ALIGN_CLASSES[column.align ?? "left"]
              }`}
            >
              {row[column.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
