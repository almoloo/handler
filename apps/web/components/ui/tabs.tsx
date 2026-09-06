export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (v: string) => void;
}

export function Tabs({ tabs = [], value, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-[var(--border-default)] font-sans">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange?.(tab.value)}
            className={`mr-5 cursor-pointer border-b-2 bg-transparent px-1 py-2.5 text-[length:var(--text-base)] font-[var(--weight-medium)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              active
                ? "border-b-[var(--interactive-primary)] text-[var(--text-primary)]"
                : "border-b-transparent text-[var(--text-tertiary)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
