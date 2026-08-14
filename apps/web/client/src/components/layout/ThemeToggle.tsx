import { useTheme, type ThemeChoice } from '#/hooks/useTheme';

const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

/** 顶栏 light / dark / system 三按钮分段控件(R18,对应三态,非单 toggle)。 */
export function ThemeToggle(): React.JSX.Element {
  const { choice, set } = useTheme();
  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5"
    >
      {CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={choice === c}
          onClick={() => {
            set(c);
          }}
          className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
            choice === c ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-hover hover:text-fg'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
