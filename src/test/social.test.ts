import { describe, expect, it } from "vitest";
import { nextVote, nextVoteCounts, toVote } from "@/lib/social";

describe("like and dislike toggling", () => {
  it("likes an unvoted post", () => {
    expect(nextVote(0, 1)).toBe(1);
    expect(nextVoteCounts(7, 2, 0, 1)).toEqual({ up: 8, down: 2 });
  });
  it("clears a like on second tap", () => {
    expect(nextVote(1, 1)).toBe(0);
    expect(nextVoteCounts(8, 2, 1, 1)).toEqual({ up: 7, down: 2 });
  });
  it("switches a like to a dislike", () => {
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVoteCounts(8, 2, 1, -1)).toEqual({ up: 7, down: 3 });
  });
  it("switches a dislike to a like", () => {
    expect(nextVote(-1, 1)).toBe(1);
    expect(nextVoteCounts(7, 3, -1, 1)).toEqual({ up: 8, down: 2 });
  });
  it("clears a dislike on second tap", () => {
    expect(nextVote(-1, -1)).toBe(0);
    expect(nextVoteCounts(7, 3, -1, -1)).toEqual({ up: 7, down: 2 });
  });
  it("never goes below zero", () => {
    expect(nextVoteCounts(0, 0, 1, 1)).toEqual({ up: 0, down: 0 });
    expect(nextVoteCounts(0, 0, -1, -1)).toEqual({ up: 0, down: 0 });
  });
  it("normalizes stored votes", () => {
    expect(toVote(1)).toBe(1);
    expect(toVote(-1)).toBe(-1);
    expect(toVote(0)).toBe(0);
    expect(toVote(undefined)).toBe(0);
  });
});
