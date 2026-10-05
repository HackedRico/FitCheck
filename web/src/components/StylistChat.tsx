import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { api, errorMessage, type ChatTurn } from "../api/client";
import { useApp } from "../state/app";
import { Icon } from "./Icons";

// =============================================================================
// Module Overview
// =============================================================================
// The stylist, docked at the bottom of a result. Each message goes to `/chat` with
// the history, the candidate and its verdict; the stylist explains the verdict
// and never changes it. A reply that asks for a render starts one on the person
// photo and calls `onRender` so the page can scroll up to it.

const PROMPTS = ["Why this verdict?", "What do I wear it with?", "Will it work this week?"];

/** Chat with the stylist about the current candidate. */
export function StylistChat({ onRender }: { onRender: () => void }): ReactNode {
  const { flow, settings, location, person, pipelines, navigate } = useApp();
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement | null>(null);
  // The scan this conversation is about; `null` once it is gone, so a late reply cannot render on the next one
  const scanId = useRef<number | null>(flow.id);

  // A new scan is a new conversation
  useEffect(() => {
    scanId.current = flow.id;
    setHistory([]);
    setError(null);
    return () => {
      scanId.current = null;
    };
  }, [flow.id]);

  // The log scrolls inside the dock, so pin it to the newest turn rather than moving the page
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [history.length, busy]);

  const candidate = flow.scan.status === "done" ? flow.scan.value.tags : null;
  const verdict = flow.judge.status === "done" ? flow.judge.value.verdict : null;

  const send = async (message: string): Promise<void> => {
    const text = message.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    const before = history;
    const askedAbout = flow.id;
    setHistory([...before, { role: "user", text }]);
    try {
      const out = await api.chat({
        owner: settings.owner,
        message: text,
        history: before,
        candidate,
        verdict,
        location: location.location,
      });
      pipelines.record("chat", out.pipeline);
      if (scanId.current !== askedAbout) return;
      setHistory((turns) => [...turns, { role: "stylist", text: out.reply.text }]);
      if (out.reply.render) {
        if (person.photo) {
          flow.requestRender(person.photo, "stylist");
          onRender();
        } else {
          setError("The stylist wants to show you. Add your photo first.");
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <div className="fc-chat">
      {history.length === 0 && (
        <div className="fc-chat-prompts">
          {PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="fc-chip" disabled={busy} onClick={() => void send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <ol ref={logRef} className="fc-chat-log">
          {history.map((turn, i) => (
            <li key={i} className={`fc-bubble is-${turn.role}`}>
              {turn.text}
            </li>
          ))}
          {busy && (
            <li className="fc-bubble is-stylist is-typing" aria-label="The stylist is typing">
              <i />
              <i />
              <i />
            </li>
          )}
        </ol>
      )}
      {error && (
        <p className="fc-error">
          {error}
          {!person.photo && (
            <button type="button" onClick={() => navigate("you")}>
              Add photo
            </button>
          )}
        </p>
      )}
      <form className="fc-chat-form" onSubmit={submit}>
        <input
          value={draft}
          maxLength={2000}
          aria-label="Ask the stylist"
          placeholder="Ask anything about this piece"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="fc-send" disabled={busy || !draft.trim()} aria-label="Send">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
