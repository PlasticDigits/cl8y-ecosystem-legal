import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type ClickwrapClient } from "./client.js";
import { pollUntilSigned } from "./poll.js";

describe("pollUntilSigned", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns when signed_latest becomes true", async () => {
    vi.useFakeTimers();
    const client: ClickwrapClient = {
      apiBaseUrl: "https://api.example.com",
      termsBaseUrl: "https://terms.example.com",
      getTermsLatest: vi.fn(),
      getTermsContent: vi.fn(),
      submitWallet: vi.fn(),
      submitTelegram: vi.fn(),
      getSignatureStatus: vi
        .fn()
        .mockResolvedValueOnce({
          property: "cl8y.com",
          latest_version: "Draft 1.3",
          signed_latest: false,
          signed_version: null,
          signed_at: null,
        })
        .mockResolvedValueOnce({
          property: "cl8y.com",
          latest_version: "Draft 1.3",
          signed_latest: true,
          signed_version: "Draft 1.3",
          signed_at: "2026-05-26T00:00:00Z",
        }),
    };

    const promise = pollUntilSigned(client, {
      property: "cl8y.com",
      network: "EVM",
      account: "0xabc",
      intervalMs: 1000,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ signed_latest: true });
  });
});
