export interface StepperProps {
  steps: string[];
  current: number;
}

type StepState = "done" | "active" | "upcoming";

const CIRCLE_CLASSES: Record<StepState, string> = {
  done: "bg-[var(--interactive-primary)] text-[var(--gray-0)]",
  active: "border border-[var(--interactive-primary)] bg-[var(--surface-card)] text-[var(--interactive-primary)]",
  upcoming: "bg-[var(--gray-100)] text-[var(--text-tertiary)]",
};

const LABEL_CLASSES: Record<StepState, string> = {
  done: "text-[var(--text-primary)]",
  active: "text-[var(--text-primary)]",
  upcoming: "text-[var(--text-tertiary)]",
};

export function Stepper({ steps = [], current = 0 }: StepperProps) {
  return (
    <div className="flex items-center font-sans">
      {steps.map((step, i) => {
        const state: StepState = i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[length:var(--text-xs)] font-[var(--weight-semibold)] ${CIRCLE_CLASSES[state]}`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={`text-[length:var(--text-sm)] font-[var(--weight-medium)] ${LABEL_CLASSES[state]}`}
              >
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="mx-2.5 h-px w-8 bg-[var(--border-default)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
