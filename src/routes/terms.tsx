import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms · Sneaky Confessions" },
      { name: "description", content: "The rules for using Sneaky Confessions." },
      { property: "og:title", content: "Terms · Sneaky Confessions" },
      { property: "og:description", content: "The rules for using Sneaky Confessions." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage
      title="Terms"
      intro="Sneaky Confessions is a community project for sharing campus stories. By using it, you agree to these terms."
    >
      <h2>Using the app</h2>
      <p>
        You must be at least 16 and able to follow our{" "}
        <Link to="/guidelines">Community guidelines</Link>. You are responsible for what you post
        and for keeping your alias credentials safe. One person should not run multiple aliases to
        fake engagement or evade moderation.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you write. You give us permission to store, display and moderate
        it as part of running the app. Only post content you have the right to share, and do not
        post other people's private information.
      </p>

      <h2>Anonymity is not a guarantee</h2>
      <p>
        We do not publish identities, but no online system is perfectly anonymous. Do not post
        anything you could not afford to be connected to you. Treat aliases and guest sessions as
        pseudonymous, not magic.
      </p>

      <h2>Moderation</h2>
      <p>
        Moderators may approve, remove, warn or suspend content and aliases to enforce the
        guidelines. We may also pause all posting during an incident. Moderation decisions are made
        at our discretion and are logged internally. Serious or repeated violations can end access.
      </p>

      <h2>Prohibited use</h2>
      <ul>
        <li>Harassment, threats, hate, doxxing, or sharing someone's private information.</li>
        <li>Sexual content involving minors, or non-consensual intimate content.</li>
        <li>Impersonating other people, staff or moderators.</li>
        <li>Spam, scams, advertising, ban evasion, or automated manipulation.</li>
        <li>Illegal activity or content that would put someone in danger.</li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        The app is provided as-is and may be unavailable, change, or shut down. We may update these
        terms; the updated date on this page shows the current version. Continued use means you
        accept the changes.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, the operator is not liable for user-generated content or for
        losses arising from use of the app. Nothing here limits rights that cannot legally be
        limited.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or takedown requests can be raised through the channel where this app was shared,
        or by reporting the content in the app. See our <Link to="/privacy">Privacy</Link> page for
        how data is handled.
      </p>
    </LegalPage>
  );
}
