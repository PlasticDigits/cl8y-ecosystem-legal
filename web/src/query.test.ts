import { afterEach, describe, expect, it } from "vitest";
import { getAppName, getClaimedAccount, getQueryParams, getRedirectUri, requireProperty } from "./query";

function setSearch(search: string) {
  const path = search ? `?${search}` : "";
  window.history.replaceState({}, "", `${window.location.pathname}${path}`);
}

describe("query params", () => {
  afterEach(() => {
    setSearch("");
  });

  it("reads search params", () => {
    setSearch("property=cl8y.com&app_name=MyApp");
    expect(getQueryParams().get("property")).toBe("cl8y.com");
    expect(getAppName()).toBe("MyApp");
  });

  it("requireProperty trims and rejects empty", () => {
    setSearch("property=%20%20");
    expect(requireProperty()).toBeNull();
    setSearch("property=");
    expect(requireProperty()).toBeNull();
    setSearch("property=cl8y.com");
    expect(requireProperty()).toBe("cl8y.com");
  });

  it("getRedirectUri returns value or null", () => {
    setSearch("redirect_uri=https%3A%2F%2Fexample.com");
    expect(getRedirectUri()).toBe("https://example.com");
    setSearch("");
    expect(getRedirectUri()).toBeNull();
  });

  it("getClaimedAccount trims and rejects empty", () => {
    setSearch("account=%20terra1abc%20");
    expect(getClaimedAccount()).toBe("terra1abc");
    setSearch("account=");
    expect(getClaimedAccount()).toBeNull();
  });
});
