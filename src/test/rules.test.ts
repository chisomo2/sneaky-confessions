import { describe, expect, it } from "vitest";
import { CATEGORIES, titleFor } from "@/lib/app";

describe("categories", () => {
  it("no longer offers Roommates", () => expect(CATEGORIES).not.toContain("Roommates"));
});

describe("titles", () => {
  it("50 karma is Campus Informant", () => expect(titleFor(50)).toBe("Campus Informant"));
  it("150 karma is Gossip Master", () => expect(titleFor(150)).toBe("Gossip Master"));
  it("500 karma is Undercover Legend", () => expect(titleFor(500)).toBe("Undercover Legend"));
});
