import { afterEach, describe, expect, it } from "vitest";
import { isEvmWalletConnectConfigured, isEvmWalletConnectOffered } from "./walletConnect";

describe("isEvmWalletConnectOffered", () => {
  afterEach(() => {
    delete window.__CL8Y_EVM_WC_TEST__;
  });

  it("gates on a Legal-owned project id unless the e2e hook is present", () => {
    expect(isEvmWalletConnectConfigured()).toBe(Boolean(import.meta.env.VITE_WC_PROJECT_ID));
    expect(isEvmWalletConnectOffered()).toBe(Boolean(import.meta.env.VITE_WC_PROJECT_ID));
    window.__CL8Y_EVM_WC_TEST__ = async () => {
      throw new Error("unused");
    };
    expect(isEvmWalletConnectOffered()).toBe(true);
  });
});
