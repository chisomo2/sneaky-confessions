export type Vote = -1 | 0 | 1;

export function toVote(value: number | null | undefined): Vote {
  return value === 1 ? 1 : value === -1 ? -1 : 0;
}

/** Clicking the active vote clears it; clicking the other one switches to it. */
export function nextVote(current: Vote, choice: 1 | -1): Vote {
  return current === choice ? 0 : choice;
}

export function nextVoteCounts(
  up: number,
  down: number,
  current: Vote,
  choice: 1 | -1,
): { up: number; down: number } {
  const next = nextVote(current, choice);
  const nextUp = up - (current === 1 ? 1 : 0) + (next === 1 ? 1 : 0);
  const nextDown = down - (current === -1 ? 1 : 0) + (next === -1 ? 1 : 0);
  return { up: Math.max(nextUp, 0), down: Math.max(nextDown, 0) };
}
