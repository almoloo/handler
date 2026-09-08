import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function HireSuccess({
  agentName,
  onDone,
}: {
  agentName: string;
  onDone: () => void;
}) {
  return (
    <section className="flex flex-col items-center gap-5 py-16 text-center font-sans">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <motion.circle
          cx="28"
          cy="28"
          r="26"
          stroke="var(--status-approved-icon)"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        <motion.path
          d="M17 29l7 7 15-15"
          stroke="var(--status-approved-icon)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.35, ease: "easeOut" }}
        />
      </svg>
      <div>
        <p className="text-[length:var(--text-md)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
          {agentName} is hired
        </p>
        <p className="mt-1 text-[length:var(--text-sm)] text-[var(--text-tertiary)]">
          Every payment now runs through the rules you just set.
        </p>
      </div>
      <Button onClick={onDone}>Go to payroll</Button>
    </section>
  );
}
