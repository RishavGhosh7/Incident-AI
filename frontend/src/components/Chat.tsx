import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../lib/api";

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}

function renderMarkdownLite(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code class='font-mono text-[color:var(--color-accent)]'>$1</code>");
    return (
      <p
        key={i}
        className="mb-1 last:mb-0"
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
    );
  });
}

export function Chat({ messages, streamingText, disabled, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    await onSend(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !streamingText && (
          <p className="text-sm text-[color:var(--color-muted)]">
            Load a demo scenario or paste logs, then ask questions like{" "}
            <em>“Why are payment requests failing?”</em>
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`animate-fade-in max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-[color:var(--color-accent-dim)] text-[color:var(--color-text)]"
                : "mr-auto bg-[color:var(--color-panel-2)] text-[color:var(--color-text)]"
            }`}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
              {m.role === "user" ? "You" : "IncidentAI"}
            </div>
            <div>{renderMarkdownLite(m.content)}</div>
          </div>
        ))}
        {streamingText && (
          <div className="animate-fade-in mr-auto max-w-[92%] rounded-lg bg-[color:var(--color-panel-2)] px-3 py-2 text-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
              IncidentAI
            </div>
            <div>{renderMarkdownLite(streamingText)}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-[color:var(--color-line)] p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={
            disabled
              ? "Create an incident to start chatting…"
              : "Ask about this incident…"
          }
          className="flex-1 rounded border border-[color:var(--color-line)] bg-[color:var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="rounded bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-ink)] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
