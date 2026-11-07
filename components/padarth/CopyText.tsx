"use client";

import { useState } from "react";

// Copies the preview (lib/padarth/preview-text.ts) as formatted text and as plain text together:
// Google Slides, Docs and most editors paste the formatted version (bold, bullets, italics), plain
// editors the Markdown-flavoured text. Falls back to plain text alone where the browser can't write
// HTML to the clipboard, and to a box to copy by hand where it can't write at all.
export function CopyText({ text, html, slidesHref }: { text: string; html?: string; slidesHref?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    try {
      if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
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
      {slidesHref && (
        <>
          <a href={slidesHref} download>
            Download for Google Slides (.pptx)
          </a>{" "}
        </>
      )}
      <span role="status">{state === "copied" ? "Copied." : state === "manual" ? "Couldn't reach the clipboard: copy it from the box." : ""}</span>
      {state === "manual" && <textarea readOnly value={text} rows={12} className="padarth-copy-box" onFocus={(e) => e.currentTarget.select()} autoFocus />}
    </div>
  );
}
