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
    vi.unstubAllGlobals();
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

  it("passes the connected account into the portal sign URL", async () => {
    const loc = { href: "https://ust1cmm.com/" };
    vi.stubGlobal("location", loc);
    const client = mockClient();
    const account = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";

    render(
      <TermsGate
        client={client}
        property="ust1cmm.com"
        network="TerraClassic"
        account={account}
        redirectUri="https://ust1cmm.com/"
        appName="ustr-cmm"
      >
        <p>protected content</p>
      </TermsGate>,
    );

    const button = await screen.findByRole("button", { name: "Accept Terms" });
    button.click();

    expect(loc.href).toContain("sign/terra-classic");
    expect(loc.href).toContain(`account=${account}`);
    expect(loc.href).toContain("redirect_uri=");
    expect(loc.href).toContain("app_name=ustr-cmm");
  });

  it("passes a connected EVM account into the portal sign URL", async () => {
    const loc = { href: "https://vote.cl8y.com/" };
    vi.stubGlobal("location", loc);
    const client = mockClient();
    const account = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";

    render(
      <TermsGate
        client={client}
        property="vote.cl8y.com"
        network="EVM"
        account={account}
        redirectUri="https://vote.cl8y.com/"
        appName="CL8Y Voting"
      >
        <p>protected content</p>
      </TermsGate>,
    );

    const button = await screen.findByRole("button", { name: "Accept Terms" });
    button.click();

    expect(loc.href).toContain("sign/evm");
    expect(loc.href).toContain(`account=${account}`);
    expect(loc.href).toContain("redirect_uri=");
    expect(loc.href).toContain("app_name=CL8Y+Voting");
  });

  it("passes a connected Solana account into the portal sign URL", async () => {
    const loc = { href: "https://example.com/" };
    vi.stubGlobal("location", loc);
    const client = mockClient();
    const account = "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2";

    render(
      <TermsGate
        client={client}
        property="cl8y.com"
        network="Solana"
        account={account}
        redirectUri="https://cl8y.com/"
        appName="Demo"
      >
        <p>protected content</p>
      </TermsGate>,
    );

    const button = await screen.findByRole("button", { name: "Accept Terms" });
    button.click();

    expect(loc.href).toContain("sign/solana");
    expect(loc.href).toContain(`account=${account}`);
    expect(loc.href).toContain("redirect_uri=");
    expect(loc.href).toContain("app_name=Demo");
  });
});
