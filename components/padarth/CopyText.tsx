"use client";

import { useState } from "react";

// Copies the preview as text (lib/padarth/preview-text.ts). Falls back to selecting the text in a
// box to copy by hand when the clipboard isn't available (an http origin, a denied permission).
export function CopyText({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("manual");
    }
  }
  return (
    <div className="padarth-copy">
      <button type="button" onClick={copy}>
        Copy as text
      </button>{" "}
      <span role="status">{state === "copied" ? "Copied." : state === "manual" ? "Couldn't reach the clipboard: copy it from the box." : ""}</span>
      {state === "manual" && <textarea readOnly value={text} rows={12} className="padarth-copy-box" onFocus={(e) => e.currentTarget.select()} autoFocus />}
    </div>
  );
}
