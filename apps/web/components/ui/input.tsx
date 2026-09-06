"use client";

import { useState, type ReactNode } from "react";

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: "text" | "number" | "email" | "password";
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
  disabled?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  prefix,
  suffix,
  error,
  hint,
  disabled = false,
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const borderClass = error
    ? "border-[var(--status-error-border)]"
    : focused
      ? "border-[var(--border-focus)]"
      : "border-[var(--border-default)]";

  return (
    <div className="flex flex-col gap-1.5 font-sans">
      {label && (
        <label className="text-[length:var(--text-sm)] font-[var(--weight-medium)] text-[var(--text-primary)]">
          {label}
        </label>
      )}
      <div
        className={`flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border px-3 transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${borderClass} ${
          disabled ? "bg-[var(--surface-sunken)]" : "bg-[var(--surface-card)]"
        } ${focused ? "shadow-[var(--shadow-focus)]" : ""}`}
      >
        {prefix && (
          <span className="text-[length:var(--text-base)] text-[var(--text-tertiary)]">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange?.(e.target.value)}
          className="flex-1 border-none bg-transparent font-sans text-[length:var(--text-base)] text-[var(--text-primary)] outline-none [font-variant-numeric:tabular-nums]"
        />
        {suffix && (
          <span className="text-[length:var(--text-base)] text-[var(--text-tertiary)]">
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <span className="text-[length:var(--text-xs)] text-[var(--status-error-fg)]">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
