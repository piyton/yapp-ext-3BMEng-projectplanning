/**
 * Checklist-items en subtask-regels, met optionele toggle (afvinken) en
 * inline-edit (pencil → input). Toggle en edit werken via props-callbacks
 * zodat de parent de mutations kan batchen / optimistic houden.
 */

import { useEffect, useRef, useState } from "react";
import type { ChecklistItem, SubtaskItem } from "../types";

interface CheckboxProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  variant?: "default" | "subtask";
}

function Checkbox({ checked, onChange, variant = "default" }: CheckboxProps) {
  const interactive = typeof onChange === "function";
  const base = "mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center";
  const borderCls = checked
    ? "bg-green-500 border-green-500"
    : variant === "subtask"
      ? "border-purple-3bm bg-white"
      : "border-gray-400 bg-white";
  const cursor = interactive ? "cursor-pointer hover:brightness-95" : "";
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={`${base} ${borderCls} ${cursor}`}
      aria-pressed={checked}
      aria-label={checked ? "Uitvinken" : "Afvinken"}
    >
      {checked && <span className="text-white text-[10px] leading-none">✓</span>}
    </button>
  );
}

interface ChecklistLineProps {
  item: ChecklistItem;
  onToggle?: (item: ChecklistItem, nextDone: boolean) => void;
}

export function ChecklistLine({ item, onToggle }: ChecklistLineProps) {
  return (
    <li className="flex items-start gap-2 py-0.5">
      <Checkbox
        checked={item.done}
        onChange={onToggle ? (next) => onToggle(item, next) : undefined}
      />
      <span className={`text-xs ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
        {item.label}
      </span>
    </li>
  );
}

interface SubtaskLineProps {
  subtask: SubtaskItem;
  onOpen?: (taskName: string) => void;
  onToggle?: (subtask: SubtaskItem, nextDone: boolean) => void;
  onEditSubject?: (subtask: SubtaskItem, newSubject: string) => void;
}

export function SubtaskLine({ subtask, onOpen, onToggle, onEditSubject }: SubtaskLineProps) {
  const displaySubject = subtask.subject.replace(/^(CTRL|START)\s*:\s*/, "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displaySubject);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => { setDraft(displaySubject); }, [displaySubject]);

  const commit = () => {
    const newSubj = subtask.kind
      ? `${subtask.kind}: ${draft.trim()}`
      : draft.trim();
    if (newSubj && newSubj !== subtask.subject) {
      onEditSubject?.(subtask, newSubj);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(displaySubject);
    setEditing(false);
  };

  return (
    <li
      className={`flex items-start gap-2 py-0.5 pl-2 pr-1 ml-3 border-l-2 border-purple-3bm rounded-r bg-purple-50/50`}
    >
      <Checkbox
        checked={subtask.done}
        onChange={onToggle ? (next) => onToggle(subtask, next) : undefined}
        variant="subtask"
      />
      {subtask.kind && (
        <span className="inline-block bg-purple-3bm/10 text-purple-3bm text-[9px] font-bold px-1 rounded leading-[14px]">
          {subtask.kind}
        </span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          className="flex-1 text-xs border border-purple-3bm/40 rounded px-1 py-[1px] focus:outline-none focus:border-purple-3bm"
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpen?.(subtask.taskName)}
          className={`flex-1 text-left text-xs font-medium ${
            subtask.done ? "line-through text-gray-400" : "text-purple-3bm hover:underline"
          }`}
          title={`Subtask ${subtask.taskName}`}
        >
          {displaySubject}
        </button>
      )}
      {onEditSubject && !editing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-[10px] text-gray-400 hover:text-purple-3bm px-1"
          title="Bewerk subject"
          aria-label="Bewerk"
        >
          ✎
        </button>
      )}
    </li>
  );
}
