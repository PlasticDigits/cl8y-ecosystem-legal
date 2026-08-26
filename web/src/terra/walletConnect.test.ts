import { afterEach, describe, expect, it } from "vitest";
import { isGalaxyWalletConnectConfigured, isWalletConnectOffered } from "./walletConnect";

describe("isWalletConnectOffered", () => {
  afterEach(() => {
    delete window.__CL8Y_TERRA_WC_TEST__;
  });

  it("always offers LUNC Dash and gates Galaxy on a Legal-owned project id", () => {
    expect(isWalletConnectOffered("luncdash")).toBe(true);
    expect(isWalletConnectOffered("keplr")).toBe(false);
    expect(isGalaxyWalletConnectConfigured()).toBe(Boolean(import.meta.env.VITE_WC_PROJECT_ID));
  });
});
