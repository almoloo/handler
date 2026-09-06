export interface AvatarProps {
  name: string;
  size?: number;
  src?: string | null;
}

const HUES = [
  "var(--brand-500)",
  "var(--green-600)",
  "var(--amber-600)",
  "var(--slate-600)",
];

function hueFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % HUES.length;
  }
  return HUES[hash] ?? HUES[0];
}

export function Avatar({ name, size = 36, src = null }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- straight port of the design system's Avatar; arbitrary avatar URLs, no next/image domain config yet.
      <img
        src={src}
        alt={name}
        className="rounded-full border border-[var(--border-subtle)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-[var(--weight-semibold)] text-[var(--text-inverse)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: hueFor(name),
      }}
    >
      {initials || "?"}
    </span>
  );
}
