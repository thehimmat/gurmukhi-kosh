/** The Dictionaries tab is curator-only: public /word pages never list it. */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabNav } from "../components/word/TabNav";

describe("TabNav", () => {
  it("lists Dictionaries for a curator, keeping curator mode in the link", () => {
    const html = renderToStaticMarkup(<TabNav gurmukhi="ਨਾਮੁ" curator />);
    expect(html).toContain("Dictionaries");
    expect(html).toMatch(/href="\/admin\/word\/[^"]*tab=dictionaries"/);
  });

  it("doesn't list it publicly", () => {
    expect(renderToStaticMarkup(<TabNav gurmukhi="ਨਾਮੁ" />)).not.toContain("Dictionaries");
  });
});
