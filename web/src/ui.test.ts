import { describe, expect, it } from "vitest";
import { el, renderMissingProperty } from "./ui";

describe("ui helpers", () => {
  it("el creates element with className and attributes", () => {
    const node = el("a", { className: "button", href: "/x" }, ["Click"]);
    expect(node.tagName).toBe("A");
    expect(node.className).toBe("button");
    expect(node.getAttribute("href")).toBe("/x");
    expect(node.textContent).toBe("Click");
  });

  it("renderMissingProperty shows required parameter error", () => {
    const root = document.createElement("div");
    renderMissingProperty(root);
    expect(root.textContent).toMatch(/Missing required query parameter/i);
    expect(root.textContent).toMatch(/property/i);
  });
});
