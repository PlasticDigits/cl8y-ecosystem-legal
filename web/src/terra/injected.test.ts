import { afterEach, describe, expect, it } from "vitest";
import {
  getInjectedProvider,
  hasAnyInjectedTerraWallet,
  listInjectedWalletIds,
  signWithInjectedProvider,
} from "./injected";

describe("injected Terra providers", () => {
  afterEach(() => {
    delete window.keplr;
    delete window.station;
    delete window.leap;
    delete window.cosmostation;
    delete window.galaxyStation;
    delete window.trustwallet;
  });

  it("does not require window.keplr when Leap is injected", () => {
    window.leap = {
      enable: async () => {},
      getKey: async () => ({ bech32Address: "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt" }),
      signArbitrary: async () => ({
        signature: "sig",
        pub_key: { type: "tendermint/PubKeySecp256k1", value: "pub" },
      }),
    };
    expect(getInjectedProvider("keplr")).toBeNull();
    expect(getInjectedProvider("leap")).toBeTruthy();
    expect(listInjectedWalletIds()).toEqual(["leap"]);
    expect(hasAnyInjectedTerraWallet()).toBe(true);
  });

  it("resolves Station via window.station.keplr and Cosmostation via providers.keplr", () => {
    const provider = {
      enable: async () => {},
      getKey: async () => ({ bech32Address: "terra1abc" }),
      signArbitrary: async () => ({
        signature: "sig",
        pub_key: { type: "t", value: "p" },
      }),
    };
    window.station = { keplr: provider };
    window.cosmostation = { providers: { keplr: provider } };
    expect(getInjectedProvider("station")).toBe(provider);
    expect(getInjectedProvider("cosmostation")).toBe(provider);
  });

  it("signs through the injected provider without touching window.keplr", async () => {
    const calls: unknown[] = [];
    window.leap = {
      enable: async (id) => {
        calls.push(["enable", id]);
      },
      getKey: async () => ({ bech32Address: "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt" }),
      signArbitrary: async (chainId, signer, data) => {
        calls.push(["sign", chainId, signer, data]);
        return {
          signature: "sig",
          pub_key: { type: "tendermint/PubKeySecp256k1", value: "pub" },
        };
      },
    };
    const result = await signWithInjectedProvider("leap", "legal-message");
    expect(result).toEqual({
      accountId: "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt",
      signature: "sig",
      pubkey: "pub",
    });
    expect(calls[0]).toEqual(["enable", "columbus-5"]);
    expect(calls[1]).toEqual([
      "sign",
      "columbus-5",
      "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt",
      "legal-message",
    ]);
  });
});
