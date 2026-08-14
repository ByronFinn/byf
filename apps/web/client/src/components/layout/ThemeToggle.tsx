import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type ThemeChoice } from '#/hooks/useTheme';

const CHOICES: readonly { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Follow system theme', Icon: Monitor },
];

/** 顶栏 light / dark / system 三按钮分段控件(R18,对应三态,非单 toggle)。 */
export function ThemeToggle(): React.JSX.Element {
  const { choice, set } = useTheme();
  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5"
    >
      {CHOICES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={choice === value}
          title={label}
          onClick={() => {
            set(value);
          }}
          className={`flex items-center justify-center rounded-sm p-1 transition-colors ${
            choice === value
              ? 'bg-brand text-on-brand'
              : 'text-fg-muted hover:bg-hover hover:text-fg'
          }`}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
