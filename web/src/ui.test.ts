import { afterEach, describe, expect, it, vi } from "vitest";
import { el, renderMissingProperty, renderSuccess } from "./ui";

describe("ui helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("renderSuccess offers Continue only for allowlisted redirect_uri", () => {
    vi.stubEnv("VITE_REDIRECT_URI_ALLOWLIST", "https://cl8y.com");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_REDIRECT", "false");

    const root = document.createElement("div");
    renderSuccess(root, "1.5", "https://cl8y.com/app");
    expect(root.textContent).toMatch(/Accepted/);
    expect(root.querySelector("a.button")?.getAttribute("href")).toBe("https://cl8y.com/app");
  });

  it("renderSuccess ignores evil redirect_uri but still shows success", () => {
    vi.stubEnv("VITE_REDIRECT_URI_ALLOWLIST", "https://cl8y.com");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_REDIRECT", "false");

    const root = document.createElement("div");
    renderSuccess(root, "1.5", "https://evil.example");
    expect(root.textContent).toMatch(/Accepted/);
    expect(root.querySelector("a.button")).toBeNull();
  });
});
