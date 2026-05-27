import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./client.js";

describe("createClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getTermsLatest fetches and parses JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          property: "cl8y.com",
          version_label: "Draft 1.3",
          effective_date: "2026-05-26",
          content_sha256: "abc",
          published_at: "2026-05-26T00:00:00Z",
          sign_urls: {
            evm: "https://terms.cl8y.com/sign/evm?property=cl8y.com",
            solana: "https://terms.cl8y.com/sign/solana?property=cl8y.com",
            terra_classic: "https://terms.cl8y.com/sign/terra-classic?property=cl8y.com",
            telegram: "https://terms.cl8y.com/sign/telegram?property=cl8y.com",
          },
        }),
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    const terms = await client.getTermsLatest("cl8y.com");
    expect(terms.version_label).toBe("Draft 1.3");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.example.com/api/v1/terms/latest?property=cl8y.com");
  });

  it("throws API error message from JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        json: async () => ({ error: "invalid property" }),
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    await expect(client.getTermsLatest("bad")).rejects.toThrow("invalid property");
  });

  it("falls back to statusText when error field missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Server Error",
        json: async () => {
          throw new Error("not json");
        },
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    await expect(client.submitWallet({})).rejects.toThrow("Server Error");
  });

  it("getSignatureStatus builds query string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          property: "cl8y.com",
          latest_version: "Draft 1.3",
          signed_latest: true,
          signed_version: "Draft 1.3",
          signed_at: "2026-05-26T00:00:00Z",
        }),
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    const status = await client.getSignatureStatus("cl8y.com", "EVM", "0xabc");
    expect(status.signed_latest).toBe(true);
    const [statusUrl] = vi.mocked(fetch).mock.calls[0];
    expect(statusUrl).toBe(
      "https://api.example.com/api/v1/signatures/status?property=cl8y.com&network=EVM&account=0xabc",
    );
  });

  it("getTermsContent returns plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/plain" },
        text: async () => "Terms body",
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    await expect(client.getTermsContent("cl8y.com")).resolves.toBe("Terms body");
  });

  it("submitTelegram POSTs JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "1", signed_at: "2026-05-26T00:00:00Z" }),
      }),
    );
    const client = createClient({ apiBaseUrl: "https://api.example.com" });
    const res = await client.submitTelegram({ property: "x" });
    expect(res.id).toBe("1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/signatures/telegram",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
