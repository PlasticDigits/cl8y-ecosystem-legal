import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClickwrapClient } from "../client.js";
import { TermsGate } from "./TermsGate.js";
import { useSignatureStatus } from "./useSignatureStatus.js";

function mockClient(overrides: Partial<ClickwrapClient> = {}): ClickwrapClient {
  return {
    apiBaseUrl: "https://api.example.com",
    termsBaseUrl: "https://terms.example.com",
    getTermsLatest: vi.fn().mockResolvedValue({
      property: "cl8y.com",
      version_label: "Draft 1.3",
      effective_date: "2026-05-26",
      content_sha256: "abc",
      published_at: "2026-05-26T00:00:00Z",
      sign_urls: {
        evm: "https://terms.example.com/sign/evm?property=cl8y.com",
        solana: "https://terms.example.com/sign/solana?property=cl8y.com",
        terra_classic: "https://terms.example.com/sign/terra-classic?property=cl8y.com",
        telegram: "https://terms.example.com/sign/telegram?property=cl8y.com",
      },
    }),
    getTermsContent: vi.fn(),
    getSignatureStatus: vi.fn().mockResolvedValue({
      property: "cl8y.com",
      latest_version: "Draft 1.3",
      signed_latest: false,
      signed_version: null,
      signed_at: null,
    }),
    submitWallet: vi.fn(),
    submitTelegram: vi.fn(),
    ...overrides,
  };
}

describe("useSignatureStatus", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("returns signed state from API", async () => {
    const client = mockClient({
      getSignatureStatus: vi.fn().mockResolvedValue({
        property: "cl8y.com",
        latest_version: "Draft 1.3",
        signed_latest: true,
        signed_version: "Draft 1.3",
        signed_at: "2026-05-26T00:00:00Z",
      }),
    });

    function Probe() {
      const { isSigned, loading } = useSignatureStatus({
        client,
        property: "cl8y.com",
        network: "EVM",
        account: "0xabc",
      });
      if (loading) return <p>loading</p>;
      return <p>{isSigned ? "signed" : "unsigned"}</p>;
    }

    render(<Probe />);
    await waitFor(() => {
      expect(screen.getByText("signed")).toBeTruthy();
    });
  });
});

describe("TermsGate", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children when signed", async () => {
    const client = mockClient({
      getSignatureStatus: vi.fn().mockResolvedValue({
        property: "cl8y.com",
        latest_version: "Draft 1.3",
        signed_latest: true,
        signed_version: "Draft 1.3",
        signed_at: "2026-05-26T00:00:00Z",
      }),
    });

    render(
      <TermsGate client={client} property="cl8y.com" network="EVM" account="0xabc">
        <p>protected content</p>
      </TermsGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("protected content")).toBeTruthy();
    });
  });

  it("shows accept UI when unsigned", async () => {
    const client = mockClient();

    render(
      <TermsGate client={client} property="cl8y.com" network="EVM" account="0xabc">
        <p>protected content</p>
      </TermsGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Accept Terms" })).toBeTruthy();
      expect(screen.queryByText("protected content")).toBeNull();
    });
  });
});
