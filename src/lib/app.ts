export const CATEGORIES = [
  "Campus Drama",
  "Crushes",
  "Academics",
  "Late Night",
  "Hot Takes",
  "Confessions",
] as const;

export const REACTIONS = ["🔥", "💀", "🤫", "👀"] as const;
export const AVATARS = ["👻", "🦉", "🦊", "🦝", "🌙", "🐈‍⬛", "🦇", "🍵", "💅", "🕶️", "👽", "🎭"];

/** Local memory of this device's votes/reactions so buttons can show state. */
export function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
export function setLocal(key: string, v: unknown) {
  localStorage.setItem(key, JSON.stringify(v));
}

export const TITLES = [
  { min: 0, title: "Fresh Ghost" },
  { min: 10, title: "Hallway Whisperer" },
  { min: 50, title: "Campus Informant" },
  { min: 150, title: "Gossip Master" },
  { min: 500, title: "Undercover Legend" },
  { min: 1500, title: "Campus Oracle" },
];

export function titleFor(karma: number) {
  let t = TITLES[0]!;
  for (const x of TITLES) if (karma >= x.min) t = x;
  return t.title;
}

export function badgesFor(s: { karma: number; followers: number; posts: number }) {
  const b: string[] = [];
  if (s.posts >= 1) b.push("✍️ First Drop");
  if (s.posts >= 10) b.push("📢 Prolific");
  if (s.followers >= 10) b.push("👥 Has a Following");
  if (s.followers >= 50) b.push("⭐ Campus Celeb");
  if (s.karma >= 100) b.push("🔥 Heat Maker");
  return b;
}

/** Hot ranking: net votes + engagement, decayed by age in hours. */
export function hotScore(
  c: { upvotes: number; downvotes: number; comment_count: number; created_at: string },
  now = Date.now(),
) {
  const hours = (now - new Date(c.created_at).getTime()) / 36e5;
  const points = c.upvotes - c.downvotes + c.comment_count * 0.5;
  return (points + 1) / Math.pow(hours + 2, 1.5);
}

export function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function errMsg(e: unknown) {
  return e instanceof Error
    ? e.message
    : ((e as { message?: string })?.message ?? "Something went wrong");
}
