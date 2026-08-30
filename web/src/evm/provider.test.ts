import { afterEach, describe, expect, it } from "vitest";
import {
  EIP6963_ANNOUNCE,
  EIP6963_REQUEST,
  ETHEREUM_INITIALIZED,
  discoverEvmProviders,
  isEip1193Provider,
} from "./provider";
import type { Eip1193Provider } from "./provider";

function mockProvider(label: string): Eip1193Provider {
  return {
    request: async () => [label],
  };
}

describe("isEip1193Provider", () => {
  it("requires request()", () => {
    expect(isEip1193Provider(undefined)).toBe(false);
    expect(isEip1193Provider({})).toBe(false);
    expect(isEip1193Provider(mockProvider("x"))).toBe(true);
  });
});

describe("discoverEvmProviders", () => {
  afterEach(() => {
    delete window.ethereum;
    delete window.BinanceChain;
  });

  it("finds window.ethereum", async () => {
    window.ethereum = mockProvider("eth");
    const found = await discoverEvmProviders({ waitMs: 0 });
    expect(found.map((p) => p.id)).toContain("injected:ethereum");
  });

  it("treats window.BinanceChain as EIP-1193 when request exists", async () => {
    window.BinanceChain = mockProvider("bnb");
    const found = await discoverEvmProviders({ waitMs: 0 });
    expect(found).toEqual([
      expect.objectContaining({ id: "injected:binance", name: "Binance Web3" }),
    ]);
  });

  it("discovers EIP-6963 with no window.ethereum", async () => {
    const provider = mockProvider("6963");
    window.addEventListener(
      EIP6963_REQUEST,
      () => {
        window.dispatchEvent(
          new CustomEvent(EIP6963_ANNOUNCE, {
            detail: {
              info: { uuid: "u1", name: "Mock MetaMask", rdns: "io.metamask" },
              provider,
            },
          }),
        );
      },
      { once: true },
    );
    const found = await discoverEvmProviders({ waitMs: 0 });
    expect(found).toEqual([
      expect.objectContaining({ id: "eip6963:io.metamask", name: "Mock MetaMask" }),
    ]);
    expect(found[0]?.provider).toBe(provider);
  });

  it("does not duplicate an EIP-6963 provider that is also window.ethereum", async () => {
    const provider = mockProvider("both");
    window.ethereum = provider;
    window.addEventListener(
      EIP6963_REQUEST,
      () => {
        window.dispatchEvent(
          new CustomEvent(EIP6963_ANNOUNCE, {
            detail: {
              info: { uuid: "u1", name: "MetaMask", rdns: "io.metamask" },
              provider,
            },
          }),
        );
      },
      { once: true },
    );
    const found = await discoverEvmProviders({ waitMs: 0 });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("eip6963:io.metamask");
  });

  it("lists ethereum.providers without collapsing them", async () => {
    const a = mockProvider("a");
    const b = mockProvider("b");
    window.ethereum = { request: async () => [], providers: [a, b] };
    const found = await discoverEvmProviders({ waitMs: 0 });
    expect(found.map((p) => p.id)).toEqual([
      "injected:providers:0",
      "injected:providers:1",
      "injected:ethereum",
    ]);
  });

  it("picks up a late ethereum#initialized inject", async () => {
    const pending = discoverEvmProviders({ waitMs: 200 });
    queueMicrotask(() => {
      window.ethereum = mockProvider("late");
      window.dispatchEvent(new Event(ETHEREUM_INITIALIZED));
    });
    const found = await pending;
    expect(found.some((p) => p.id === "injected:ethereum")).toBe(true);
  });
});
