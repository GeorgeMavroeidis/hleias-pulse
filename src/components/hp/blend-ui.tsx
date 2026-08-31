import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/* Shared "Blend" UI primitives — the design language established on the
   account sheet (commit 4948ef4): a labelled field wrapper, the field
   class, a 3-way segmented control, and a section eyebrow (tinted icon
   chip + mono-ish label + fading rule). Reused by the composer and the
   Deals surfaces so the same vocabulary carries across the app. */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function fieldClass() {
  return "w-full rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5 text-[13px] text-hp-ink outline-none transition placeholder:text-hp-muted focus:border-hp-sunset/45 focus:bg-white/85";
}

export type SegmentOption<T extends string> = { id: T; label: string; helper: string };

/* 3-way segmented control (Account identity, Auth sign-up, composer "posting as"). */
export function IdentitySegments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={`rounded-xl px-2 py-2 text-left transition ${
              active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
            }`}
          >
            <span className="block text-[11px] font-black">{t(option.label)}</span>
            <span
              className={`block truncate text-[9px] font-semibold ${
                active ? "text-hp-paper/65" : "text-hp-muted"
              }`}
            >
              {t(option.helper)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const SECTION_TONES: Record<
  "sunset" | "deep" | "olive" | "sea",
  { chip: string; token: string }
> = {
  sunset: { chip: "bg-hp-sunset", token: "--hp-sunset" },
  deep: { chip: "bg-hp-deep", token: "--hp-deep" },
  olive: { chip: "bg-hp-olive", token: "--hp-olive" },
  sea: { chip: "bg-hp-sea", token: "--hp-sea" },
};

export type SectionTone = keyof typeof SECTION_TONES;

export function SectionHeader({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: SectionTone;
}) {
  const { chip, token } = SECTION_TONES[tone];
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px] text-hp-paper ${chip}`}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <span
        className="h-px flex-1 rounded-full"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, var(${token}) 42%, transparent), transparent)`,
        }}
      />
    </div>
  );
}
