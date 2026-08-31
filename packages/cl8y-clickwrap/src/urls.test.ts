import { describe, expect, it } from "vitest";
import { appendSignParams, buildSignUrl } from "./urls.js";

describe("sign url helpers", () => {
  it("buildSignUrl appends redirect and app name", () => {
    const url = buildSignUrl("https://terms.cl8y.com/sign/evm?property=cl8y.com", {
      redirectUri: "https://cl8y.com/",
      appName: "CL8Y",
    });
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("app_name=CL8Y");
    expect(url).not.toContain("account=");
  });

  it("buildSignUrl appends claimed account for Terra continuity", () => {
    const url = buildSignUrl("https://terms.cl8y.com/sign/terra-classic?property=ust1cmm.com", {
      account: " terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt ",
    });
    expect(url).toContain("account=terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt");
  });

  it("buildSignUrl omits blank account", () => {
    const url = buildSignUrl("https://terms.cl8y.com/sign/evm?property=cl8y.com", {
      account: "   ",
    });
    expect(url).not.toContain("account=");
  });

  it("appendSignParams updates all network urls", () => {
    const signUrls = {
      evm: "https://terms.cl8y.com/sign/evm?property=cl8y.com",
      solana: "https://terms.cl8y.com/sign/solana?property=cl8y.com",
      terra_classic: "https://terms.cl8y.com/sign/terra-classic?property=cl8y.com",
      telegram: "https://terms.cl8y.com/sign/telegram?property=cl8y.com",
    };
    const updated = appendSignParams(signUrls, {
      redirectUri: "https://cl8y.com/",
      appName: "CL8Y",
      account: "0xabc",
    });
    for (const url of Object.values(updated)) {
      expect(url).toContain("redirect_uri=");
      expect(url).toContain("app_name=CL8Y");
      expect(url).toContain("account=0xabc");
    }
  });
});
