import { describe, expect, it } from "vitest";
import { isAllowedRedirectUri, sanitizeRedirectUri } from "./redirect.js";

const opts = {
  allowlist: ["https://cl8y.com", "https://app.example.com/"],
  allowLocalhost: true,
};

describe("redirect allowlist", () => {
  it("allows https origins on the allowlist", () => {
    expect(sanitizeRedirectUri("https://cl8y.com/dashboard", opts)).toBe(
      "https://cl8y.com/dashboard",
    );
    expect(isAllowedRedirectUri("https://app.example.com/x", opts)).toBe(true);
  });

  it("allows localhost http when enabled", () => {
    expect(sanitizeRedirectUri("http://localhost:3000/cb", opts)).toBe(
      "http://localhost:3000/cb",
    );
    expect(sanitizeRedirectUri("http://127.0.0.1:5173/", opts)).toBe("http://127.0.0.1:5173/");
  });

  it("blocks attacker origins and dangerous schemes", () => {
    expect(sanitizeRedirectUri("https://evil.example", opts)).toBeNull();
    expect(sanitizeRedirectUri("javascript:alert(1)", opts)).toBeNull();
    expect(sanitizeRedirectUri("data:text/html,hi", opts)).toBeNull();
    expect(sanitizeRedirectUri("//evil.com", opts)).toBeNull();
    expect(sanitizeRedirectUri("https://user:pass@cl8y.com/", opts)).toBeNull();
  });

  it("blocks plain http for non-loopback", () => {
    expect(sanitizeRedirectUri("http://cl8y.com/", opts)).toBeNull();
  });

  it("blocks localhost when allowLocalhost is false", () => {
    expect(
      sanitizeRedirectUri("http://localhost:3000/", { allowlist: [], allowLocalhost: false }),
    ).toBeNull();
  });
});
