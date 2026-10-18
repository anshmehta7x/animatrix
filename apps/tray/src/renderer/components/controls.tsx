/** Small, quiet form controls in the panel's style. */
import { useEffect, useId, useState, type ReactNode } from "react";
import styles from "./controls.module.css";

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }): ReactNode {
  return (
    <section className={styles.group}>
      {title && <h3 className={styles.groupTitle}>{title}</h3>}
      <div className={styles.groupBody}>{children}</div>
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${checked ? styles.on : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
  onChange(v: number): void;
}): ReactNode {
  const { value, min, max, step = 1, label, format, onChange } = props;
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className={styles.sliderWrap}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ["--fill" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format && <span className={styles.sliderValue}>{format(value)}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange(v: T): void;
}): ReactNode {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? styles.segOn : styles.seg}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select(props: {
  value: string;
  options: { value: string; label: string }[];
  label: string;
  onChange(v: string): void;
}): ReactNode {
  return (
    <select
      className={styles.select}
      value={props.value}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextField(props: {
  value: string;
  label: string;
  placeholder?: string;
  onChange(v: string): void;
  onCommit?(v: string): void;
}): ReactNode {
  const id = useId();
  return (
    <input
      id={id}
      className={styles.text}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && props.onCommit?.((e.target as HTMLInputElement).value)}
      onBlur={(e) => props.onCommit?.(e.target.value)}
    />
  );
}

export function Button(props: {
  children: ReactNode;
  onClick(): void;
  kind?: "primary" | "plain" | "danger";
  disabled?: boolean;
  title?: string;
}): ReactNode {
  const cls =
    props.kind === "primary"
      ? styles.primary
      : props.kind === "danger"
        ? styles.danger
        : styles.button;
  return (
    <button
      type="button"
      className={cls}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

/** A text field that keeps its own draft and commits on Enter or blur. */
export function DraftField(props: {
  value: string;
  label: string;
  placeholder?: string;
  onCommit(v: string): void;
}): ReactNode {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <TextField
      label={props.label}
      value={draft}
      placeholder={props.placeholder}
      onChange={setDraft}
      onCommit={(v) => v !== props.value && props.onCommit(v)}
    />
  );
}
