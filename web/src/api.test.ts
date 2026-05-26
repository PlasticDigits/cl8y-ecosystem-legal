import { afterEach, describe, expect, it, vi } from "vitest";
import { getStatus, getTermsLatest, submitTelegram, submitWallet } from "./api";

describe("api client", () => {
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
          sign_urls: {},
        }),
      }),
    );
    const terms = await getTermsLatest("cl8y.com");
    expect(terms.version_label).toBe("Draft 1.3");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/api/v1/terms/latest?property=cl8y.com");
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
    await expect(getTermsLatest("bad")).rejects.toThrow("invalid property");
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
    await expect(submitWallet({})).rejects.toThrow("Server Error");
  });

  it("getStatus builds query string", async () => {
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
    const status = await getStatus("cl8y.com", "EVM", "0xabc");
    expect(status.signed_latest).toBe(true);
    const [statusUrl] = vi.mocked(fetch).mock.calls[0];
    expect(statusUrl).toContain("property=cl8y.com&network=EVM&account=0xabc");
  });

  it("submitTelegram POSTs JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "1", signed_at: "2026-05-26T00:00:00Z" }),
      }),
    );
    const res = await submitTelegram({ property: "x" });
    expect(res.id).toBe("1");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/signatures/telegram"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
