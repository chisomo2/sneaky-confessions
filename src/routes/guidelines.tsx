import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/guidelines")({
  head: () => ({
    meta: [
      { title: "Community guidelines · Sneaky Confessions" },
      { name: "description", content: "How to keep Sneaky Confessions funny, honest and safe." },
      { property: "og:title", content: "Community guidelines · Sneaky Confessions" },
      {
        property: "og:description",
        content: "How to keep Sneaky Confessions funny, honest and safe.",
      },
    ],
  }),
  component: Guidelines,
});

function Guidelines() {
  return (
    <LegalPage
      title="Community guidelines"
      intro="The tea is better when people feel safe enough to spill it. These rules apply to confessions, comments, aliases and reports."
    >
      <h2>Keep it human</h2>
      <ul>
        <li>
          Attack ideas and situations, not people. No harassment, threats, hate speech or pile-ons.
        </li>
        <li>
          Leave out names, phone numbers, room numbers, socials, photos and anything that could
          identify someone. “The guy in the green hoodie” is fine; his handle is not.
        </li>
        <li>
          No sexual content involving minors, and no non-consensual intimate content or threats to
          share it.
        </li>
        <li>No doxxing, stalking, blackmail or encouragement of self-harm.</li>
        <li>Label jokes as jokes where it matters. Don't post false accusations as fact.</li>
        <li>No spam, ads, scams, referral links or automated engagement.</li>
      </ul>

      <h2>Report, don't retaliate</h2>
      <p>
        Use the flag button on a post or comment and give a short reason. Three different signed
        sessions flagging the same content hide it automatically while moderators review it.
        Reporting the same content repeatedly from one session does not count twice.
      </p>
      <p>
        We may suspend aliases that weaponise reports or repeatedly break these rules. Report abuse
        is itself abuse.
      </p>

      <h2>What moderators can do</h2>
      <ul>
        <li>Approve content that was auto-hidden and clear its reports.</li>
        <li>Remove a post or comment, with an optional reason recorded in the audit log.</li>
        <li>Warn or suspend an alias.</li>
        <li>Pause posting across the site during a serious incident.</li>
      </ul>
      <p>
        Removed content is hidden and soft-deleted, not instantly erased, so repeat behaviour can be
        reviewed. Moderators do not reveal who reported what.
      </p>

      <h2>Appeals</h2>
      <p>
        If you believe a moderation decision was wrong, contact the operator through the channel
        where this app was shared. Include the alias and a link to the content. Decisions are
        reviewed manually.
      </p>

      <h2>Limits</h2>
      <p>
        Guest posting is rate-limited per session and network, but it is not identity-banned.
        Suspensions apply to aliases. We cannot guarantee a response time, and this is not an
        emergency service. If someone is in immediate danger, contact campus security or the police.
      </p>

      <h2>The short version</h2>
      <p>
        Be funny, be honest, protect people, and don't be a menace. See our{" "}
        <Link to="/privacy">Privacy</Link> and <Link to="/terms">Terms</Link> for the rest.
      </p>
    </LegalPage>
  );
}
