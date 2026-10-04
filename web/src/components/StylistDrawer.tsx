import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { api, errorMessage, type ChatTurn } from "../api/client";
import { useApp } from "../state/app";
import { Icon } from "./Icons";
import { Sheet } from "./Sheet";

// =============================================================================
// Module Overview
// =============================================================================
// The stylist chat. Each message goes to `/chat` with the history, the candidate
// and its verdict; the stylist explains the verdict and never changes it. When a
// reply carries a render action, the candidate is rendered on the person photo.

const PROMPTS = ["Why this verdict?", "What would I wear it with?", "Will it work this week?"];

/** The stylist drawer, reset for each new candidate. */
export function StylistDrawer(): ReactNode {
  const { sheet, openSheet, flow, settings, location, person, pipelines, navigate } = useApp();
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new scan is a new conversation
  useEffect(() => {
    setHistory([]);
    setError(null);
  }, [flow.id]);

  const candidate = flow.scan.status === "done" ? flow.scan.value.tags : null;
  const verdict = flow.judge.status === "done" ? flow.judge.value.verdict : null;

  const send = async (message: string): Promise<void> => {
    const text = message.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    const before = history;
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
      setHistory((turns) => [...turns, { role: "stylist", text: out.reply.text }]);
      if (out.reply.render) {
        if (person.photo) {
          flow.requestRender(person.photo, "stylist");
          openSheet(null);
          navigate("render");
        } else {
          setError("The stylist asked for a render. Add your photo in Me first.");
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
    <Sheet open={sheet === "stylist"} title="Stylist" onClose={() => openSheet(null)}>
      <div className="chat">
        {history.length === 0 && (
          <p className="chat-intro serif">
            {verdict ? "Ask me about this verdict, your closet or your week." : "Ask me about your closet or your week."}
          </p>
        )}
        <ol className="chat-log">
          {history.map((turn, i) => (
            <li key={i} className={`chat-turn is-${turn.role}`}>
              {turn.text}
            </li>
          ))}
          {busy && (
            <li className="chat-turn is-stylist is-typing">
              <span className="spinner" /> thinking
            </li>
          )}
        </ol>
        {error && <p className="error-line">{error}</p>}
        <div className="chat-prompts">
          {PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="btn btn-quiet" disabled={busy} onClick={() => void send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={submit}>
          <input
            value={draft}
            maxLength={2000}
            placeholder="Ask the stylist"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="icon-btn" disabled={busy || !draft.trim()} aria-label="Send">
            <Icon name="send" />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
