import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · DMI Confessions" },
      {
        name: "description",
        content: "What DMI Confessions stores, what stays private, and how long we keep it.",
      },
      { property: "og:title", content: "Privacy · DMI Confessions" },
      { property: "og:description", content: "What DMI Confessions stores and why." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro="DMI Confessions is pseudonymous, not untraceable. This page explains exactly what we store so you can decide what to share."
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Guest sessions.</strong> When you post, vote, react or report without an alias, we
          create an anonymous sign-in ID and keep it in your browser. It is not linked to your email
          or student record, but it is a stable ID for that browser session.
        </li>
        <li>
          <strong>Alias details.</strong> If you claim an alias, we store your email privately for
          sign-in, plus your public handle, avatar and bio. Your email is never shown on your
          profile.
        </li>
        <li>
          <strong>Content and activity.</strong> Confessions, comments, votes, reactions, follows,
          reports and notification state are stored with timestamps and the session or alias that
          created them.
        </li>
        <li>
          <strong>Safety data.</strong> To limit spam and abuse we store a one-way hash of the
          network address that made a write, along with the action type and time. We do not store
          raw IP addresses in the app database. Moderation actions and report reasons are kept in a
          private audit log.
        </li>
        <li>
          <strong>Browser storage.</strong> We keep your session and your own vote/reaction state in
          browser storage. We do not use advertising trackers.
        </li>
      </ul>

      <h2>What is public</h2>
      <p>
        Visible confessions, comments, aliases, avatars, bios, follower counts and karma are public.
        Guest posts appear as Ghost, and the anonymous session behind them is not shown. Reports,
        report reasons, blacklist words, rate-limit records and moderation audits are limited to
        moderators.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To show the feed, profiles, leaderboard and notifications you asked for.</li>
        <li>To prevent spam, ban evasion and brigading, and to review reports.</li>
        <li>To understand abuse patterns and keep the community usable.</li>
      </ul>
      <p>We do not sell personal data or use it for advertising.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Rate-limit events: 30 days.</li>
        <li>
          Read notifications: 90 days. Unread notifications stay until you delete them or your alias
          is removed.
        </li>
        <li>Reports: 180 days after they are submitted or resolved.</li>
        <li>Moderation audit entries: retained to keep moderation accountable.</li>
        <li>
          Removed content: hidden immediately and soft-deleted so moderators can review repeat
          behaviour. It is not shown to the public.
        </li>
      </ul>
      <p>
        Our hosting and authentication providers may keep operational logs and backups for their own
        limited retention periods.
      </p>

      <h2>Sharing and legal requests</h2>
      <p>
        We share data only with the infrastructure providers that run the app, or when required by
        law or to protect someone from serious harm. We do not publish or sell it.
      </p>

      <h2>Your choices</h2>
      <p>
        You can post as a guest, edit your public profile, sign out, delete notifications, or stop
        using the app at any time. To request access to, correction of, or deletion of data tied to
        your alias, contact the operator through the channel where this app was shared. We handle
        these requests manually; deleting an alias also removes its follows and notifications, and
        its posts become un-attributed.
      </p>

      <h2>Age</h2>
      <p>This is a campus community for DMI students. Do not use it if you are under 16.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a material way we will update this page. See also our{" "}
        <Link to="/terms">Terms</Link> and <Link to="/guidelines">Community guidelines</Link>.
      </p>
    </LegalPage>
  );
}
