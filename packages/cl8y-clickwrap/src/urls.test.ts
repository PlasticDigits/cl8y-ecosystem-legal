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
    });
    for (const url of Object.values(updated)) {
      expect(url).toContain("redirect_uri=");
      expect(url).toContain("app_name=CL8Y");
    }
  });
});
