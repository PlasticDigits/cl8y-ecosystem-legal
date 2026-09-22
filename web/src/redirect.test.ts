import { afterEach, describe, expect, it, vi } from "vitest";
import { getRedirectAllowlistOptions, safeRedirectUri } from "./redirect";

describe("portal redirect env wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses allowlist and localhost flag", () => {
    vi.stubEnv(
      "VITE_REDIRECT_URI_ALLOWLIST",
      "https://bridge.cl8y.com, https://dex.cl8y.com, https://app.example.com",
    );
    vi.stubEnv("VITE_ALLOW_LOCALHOST_REDIRECT", "true");
    expect(getRedirectAllowlistOptions()).toEqual({
      allowlist: ["https://bridge.cl8y.com", "https://dex.cl8y.com", "https://app.example.com"],
      allowLocalhost: true,
    });
    expect(safeRedirectUri("http://127.0.0.1:5173/x")).toBe("http://127.0.0.1:5173/x");
  });

  it("defaults to deny-all redirects when unset", () => {
    vi.stubEnv("VITE_REDIRECT_URI_ALLOWLIST", "");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_REDIRECT", "");
    expect(safeRedirectUri("https://bridge.cl8y.com/transfer")).toBeNull();
    expect(safeRedirectUri("javascript:alert(1)")).toBeNull();
  });
});
