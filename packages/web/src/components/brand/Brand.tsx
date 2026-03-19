import { resolveTheme } from "../../lib/themes";
import { useUIStore } from "../../stores/ui.store";

type BrandIconProps = {
  size?: number;
  className?: string;
};

type BrandLockupProps = {
  size?: number;
  compact?: boolean;
  align?: "left" | "center";
  title?: string;
  subtitle?: string;
};

export const BRAND_NAME = "Foldmark";
export const BRAND_SUBTITLE = "Markdown Workspace";

export function BrandIcon({ size = 28, className }: BrandIconProps) {
  const themeId = useUIStore((s) => s.themeId);
  const appearance = resolveTheme(themeId).appearance;
  const src = appearance === "dark" ? "/brand-mark-light-square.png" : "/brand-mark-dark-square.png";
  const iconSize = Math.round(size * 0.8);

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={src}
        width={iconSize}
        height={iconSize}
        alt={`${BRAND_NAME} logo`}
        style={{ objectFit: "contain", display: "block" }}
      />
    </span>
  );
}

export function BrandLockup({
  size = 28,
  compact = false,
  align = "left",
  title = BRAND_NAME,
  subtitle = BRAND_SUBTITLE,
}: BrandLockupProps) {
  return (
    <div
      className={`flex items-center gap-3 ${align === "center" ? "justify-center text-center" : ""}`}
      style={{ color: "var(--color-text-primary)" }}
    >
      <BrandIcon size={size} />
      <div className="min-w-0">
        <div
          className="text-sm font-semibold tracking-[0.18em] uppercase"
          style={{ color: "var(--color-accent)", fontFamily: "var(--font-brand)" }}
        >
          {title}
        </div>
        {!compact ? (
          <div
            className="text-[11px] tracking-[0.28em] uppercase"
            style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-ui)" }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
