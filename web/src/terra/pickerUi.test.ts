import { afterEach, describe, expect, it } from "vitest";
import { createTerraWalletPicker, describeWalletAvailability } from "./pickerUi";

describe("describeWalletAvailability", () => {
  it("enables injected extensions and WC rows without telling phones to install a desktop extension", () => {
    expect(describeWalletAvailability("leap", ["leap"], { mobile: true }).available).toBe(true);
    const missing = describeWalletAvailability("leap", [], {
      mobile: true,
      wcOffered: () => false,
    });
    expect(missing.available).toBe(false);
    expect(missing.reason).toMatch(/wallet app/i);
    expect(missing.reason).not.toMatch(/install/i);
    expect(missing.reason).not.toMatch(/extension/i);

    const lunc = describeWalletAvailability("luncdash", [], {
      mobile: true,
      wcOffered: () => true,
    });
    expect(lunc.available).toBe(true);
    expect(lunc.reason).toBe("Mobile wallet");
  });
});

describe("createTerraWalletPicker", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lists the ustr-cmm matrix and auto-selects only injected wallets", () => {
    const picker = createTerraWalletPicker(() => ["leap"]);
    document.body.append(picker.root);
    expect(picker.selected()).toBe("leap");
    expect(picker.root.textContent).toContain("Terra Station");
    expect(picker.root.textContent).toContain("LUNC Dash");
    expect(picker.root.textContent).toContain("Galaxy Station");
    expect(picker.root.textContent).not.toMatch(/ADR-036/i);
    expect((picker.root.querySelector("#terra-wallet-leap") as HTMLInputElement).checked).toBe(true);
    expect((picker.root.querySelector("#terra-wallet-luncdash") as HTMLInputElement).disabled).toBe(
      false,
    );
  });

  it("does not auto-select WalletConnect when nothing is injected", () => {
    const picker = createTerraWalletPicker(() => []);
    expect(picker.selected()).toBeNull();
    expect(picker.root.textContent).toMatch(/Open in Keplr/i);
  });
});
