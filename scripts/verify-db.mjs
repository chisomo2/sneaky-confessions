import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const baseline = readFileSync(
  new URL("../drizzle/migrations/0000_migration.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../drizzle/migrations/0001_hardening.sql", import.meta.url),
  "utf8",
);
const migration2 = readFileSync(
  new URL("../drizzle/migrations/0002_product_ops.sql", import.meta.url),
  "utf8",
);
const migration3 = readFileSync(
  new URL("../drizzle/migrations/0003_security_perf.sql", import.meta.url),
  "utf8",
);
const migration4 = readFileSync(
  new URL("../drizzle/migrations/0004_comment_threads.sql", import.meta.url),
  "utf8",
);

const db = new PGlite();
const results = [];
let pass = 0;
let fail = 0;

const ID = {
  anon: "00000000-0000-4000-8000-000000000001",
  a1: "00000000-0000-4000-8000-000000000002",
  a2: "00000000-0000-4000-8000-000000000003",
  a3: "00000000-0000-4000-8000-000000000004",
  a4: "00000000-0000-4000-8000-000000000005",
  a5: "00000000-0000-4000-8000-000000000006",
  a6: "00000000-0000-4000-8000-000000000007",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sql(text, params) {
  return (await db.query(text, params)).rows;
}

async function one(text, params) {
  return (await sql(text, params))[0];
}

async function run(name, fn) {
  try {
    await fn();
    pass += 1;
    results.push(`ok ${pass + fail} - ${name}`);
  } catch (error) {
    fail += 1;
    results.push(`not ok ${pass + fail} - ${name}\n  # ${String(error.message).split("\n")[0]}`);
  }
}

async function checkError(name, fn, pattern) {
  try {
    await fn();
  } catch (error) {
    if (pattern.test(error.message)) {
      pass += 1;
      results.push(`ok ${pass + fail} - ${name}`);
    } else {
      fail += 1;
      results.push(
        `not ok ${pass + fail} - ${name}\n  # wrong error: ${String(error.message).split("\n")[0]}`,
      );
    }
    return;
  }
  fail += 1;
  results.push(`not ok ${pass + fail} - ${name}\n  # expected ${pattern} but it succeeded`);
}

async function asUser(id, fn) {
  await sql("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await sql("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function asRole(role, fn) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function addAlias(id, email, handle, avatar = "👻") {
  await sql(
    "insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values ($1, $2, $3::jsonb, false)",
    [id, email, JSON.stringify({ handle, avatar })],
  );
}

async function main() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      is_anonymous boolean not null default false
    );
    create or replace function auth.uid()
    returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  await db.exec(baseline);
  await db.exec(`
    insert into public.confessions (body, category)
    values ('I used to live with three raccoons in a trench coat', 'Roommates');
  `);
  await db.exec(migration);
  await db.exec(migration2);
  await db.exec(migration3);
  await db.exec(migration4);

  await sql(
    "insert into auth.users (id, raw_user_meta_data, is_anonymous) values ($1, '{}'::jsonb, true)",
    [ID.anon],
  );
  await addAlias(ID.a1, "one@test.dev", "TestAlias", "🦊");
  await addAlias(ID.a2, "two@test.dev", "AliasTwo", "🦉");
  await addAlias(ID.a3, "three@test.dev", "AliasThree", "🦇");
  await addAlias(ID.a4, "four@test.dev", "CoolAlias", "🍵");
  await addAlias(ID.a5, "five@test.dev", "testalias", "👽");
  await addAlias(ID.a6, "six@test.dev", "admin", "🎭");

  await run("Roommates rows are moved to Confessions", async () => {
    const row = await one(
      "select category from public.confessions where body like 'I used to live%'",
    );
    assert(row.category === "Confessions", `got ${row.category}`);
  });

  await run("anonymous auth user gets no profile or role", async () => {
    const profile = await one("select count(*)::int as n from public.profiles where id = $1", [
      ID.anon,
    ]);
    const roles = await one("select count(*)::int as n from public.user_roles where user_id = $1", [
      ID.anon,
    ]);
    assert(profile.n === 0, `profiles=${profile.n}`);
    assert(roles.n === 0, `roles=${roles.n}`);
  });

  await run("alias signup creates a normalized profile and no auto-admin", async () => {
    const profile = await one("select handle, avatar from public.profiles where id = $1", [ID.a1]);
    assert(profile.handle === "testalias", `handle=${profile.handle}`);
    assert(profile.avatar === "🦊", `avatar=${profile.avatar}`);
    const admins = await one(
      "select count(*)::int as n from public.user_roles where role = 'admin'",
    );
    assert(admins.n === 0, `auto-admins=${admins.n}`);
  });

  await run("duplicate handles are suffixed", async () => {
    const profile = await one("select handle from public.profiles where id = $1", [ID.a5]);
    assert(profile.handle === "testalias1", `handle=${profile.handle}`);
  });

  await run("reserved handle is rewritten at signup", async () => {
    const profile = await one("select handle from public.profiles where id = $1", [ID.a6]);
    assert(profile.handle !== "admin", "reserved handle was kept");
    assert(
      profile.handle.startsWith("admin") && profile.handle.length <= 20,
      `handle=${profile.handle}`,
    );
  });

  await sql("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ID.a1]);

  await run("blacklist is visible to admins only", async () => {
    const admin = await asUser(
      ID.a1,
      async () => (await one("select count(*)::int as n from public.blacklist")).n,
    );
    const member = await asUser(
      ID.a2,
      async () => (await one("select count(*)::int as n from public.blacklist")).n,
    );
    assert(admin >= 2, `admin=${admin}`);
    assert(member === 0, `member=${member}`);
  });

  await checkError(
    "anon role cannot read blacklist",
    () => asRole("anon", () => sql("select count(*) from public.blacklist")),
    /permission denied/,
  );

  await checkError(
    "write_events is not readable by clients",
    () => asUser(ID.a2, () => sql("select count(*) from public.write_events")),
    /permission denied/,
  );

  await run("profile handle rules and cooldown", async () => {
    await checkError(
      "reserved rename rejected",
      () =>
        asUser(ID.a4, () =>
          sql("update public.profiles set handle = 'admin' where id = $1", [ID.a4]),
        ),
      /reserved/,
    );
    await checkError(
      "short rename rejected",
      () =>
        asUser(ID.a4, () => sql("update public.profiles set handle = 'ab' where id = $1", [ID.a4])),
      /3-20/,
    );
    await asUser(ID.a4, () =>
      sql("update public.profiles set handle = 'CoolAliasTwo' where id = $1", [ID.a4]),
    );
    const renamed = await one(
      "select handle, handle_changed_at from public.profiles where id = $1",
      [ID.a4],
    );
    assert(renamed.handle === "coolaliastwo", `handle=${renamed.handle}`);
    assert(renamed.handle_changed_at !== null, "cooldown timestamp not set");
    await checkError(
      "second rename inside cooldown rejected",
      () =>
        asUser(ID.a4, () =>
          sql("update public.profiles set handle = 'coolaliasthree' where id = $1", [ID.a4]),
        ),
      /30 days/,
    );
  });

  await run("follows are private and aliases only", async () => {
    await asUser(ID.a2, () =>
      sql("insert into public.follows (follower_id, followee_id) values ($1, $2)", [ID.a2, ID.a3]),
    );
    await asUser(ID.a2, () =>
      sql("insert into public.follows (follower_id, followee_id) values ($1, $2)", [ID.a2, ID.a1]),
    );
    const own = await asUser(
      ID.a2,
      async () => (await one("select count(*)::int as n from public.follows")).n,
    );
    const other = await asUser(
      ID.a3,
      async () => (await one("select count(*)::int as n from public.follows")).n,
    );
    assert(own === 2, `own=${own}`);
    assert(other === 0, `other=${other}`);
    await checkError(
      "anonymous guest cannot follow",
      () =>
        asUser(ID.anon, () =>
          sql("insert into public.follows (follower_id, followee_id) values ($1, $2)", [
            ID.anon,
            ID.a3,
          ]),
        ),
      /row-level security/,
    );
    await checkError(
      "self-follow rejected",
      () =>
        asUser(ID.a2, () =>
          sql("insert into public.follows (follower_id, followee_id) values ($1, $2)", [
            ID.a2,
            ID.a2,
          ]),
        ),
      /row-level security/,
    );
  });

  await run("blocked words match whole words only", async () => {
    const blocked = await one("select public.contains_blocked('you are a slur') as hit");
    const allowed = await one("select public.contains_blocked('slurred speech is fine') as hit");
    assert(blocked.hit === true, "whole word was not blocked");
    assert(allowed.hit === false, "substring was blocked");
  });

  await checkError(
    "anonymous guest cannot attribute a post to an alias",
    () =>
      asUser(ID.anon, () =>
        sql("select public.create_confession('a valid ghost post', 'Confessions', true)"),
      ),
    /Alias required/,
  );
  await checkError(
    "Roommates category is rejected",
    () =>
      asUser(ID.anon, () =>
        sql("select public.create_confession('a valid ghost post', 'Roommates', false)"),
      ),
    /Invalid category/,
  );
  await checkError(
    "blocked words are rejected server-side",
    () =>
      asUser(ID.anon, () =>
        sql(
          "select public.create_confession('you are a slur and everyone knows', 'Confessions', false)",
        ),
      ),
    /blocked words/,
  );

  let anonPostId;
  await asUser(ID.anon, async () => {
    anonPostId = (
      await one(
        "select public.create_confession('first anonymous confession', 'Confessions', false) as id",
      )
    ).id;
  });
  await asUser(ID.anon, async () => {
    for (let i = 2; i <= 5; i += 1) {
      await sql("select public.create_confession($1, 'Late Night', false)", [
        `anonymous confession number ${i}`,
      ]);
    }
  });
  await run("anonymous limit stops the sixth confession in ten minutes", async () => {
    await checkError(
      "sixth confession rate limited",
      () =>
        asUser(ID.anon, () =>
          sql(
            "select public.create_confession('anonymous confession number six', 'Late Night', false)",
          ),
        ),
      /Slow down/,
    );
  });

  let aliasPostId;
  await run("alias post is attributed and notifies followers", async () => {
    await asUser(ID.a1, async () => {
      aliasPostId = (
        await one(
          "select public.create_confession('an attributed confession from the admin alias', 'Hot Takes', true) as id",
        )
      ).id;
    });
    const post = await one("select author_id from public.confessions where id = $1", [aliasPostId]);
    assert(post.author_id === ID.a1, `author=${post.author_id}`);
    const notification = await one(
      "select count(*)::int as n from public.notifications where user_id = $1 and type = 'follow_post'",
      [ID.a2],
    );
    assert(notification.n === 1, `notifications=${notification.n}`);
  });

  await run("votes are one per signed session and can be changed", async () => {
    await asUser(ID.a2, () => sql("select public.cast_vote($1, 1)", [anonPostId]));
    let post = await one("select upvotes, downvotes from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(
      post.upvotes === 1 && post.downvotes === 0,
      `first vote ${post.upvotes}/${post.downvotes}`,
    );
    await asUser(ID.a2, () => sql("select public.cast_vote($1, 1)", [anonPostId]));
    post = await one("select upvotes, downvotes from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(
      post.upvotes === 1 && post.downvotes === 0,
      `repeat vote ${post.upvotes}/${post.downvotes}`,
    );
    await asUser(ID.a2, () => sql("select public.cast_vote($1, -1)", [anonPostId]));
    post = await one("select upvotes, downvotes from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(
      post.upvotes === 0 && post.downvotes === 1,
      `changed vote ${post.upvotes}/${post.downvotes}`,
    );
    await asUser(ID.a2, () => sql("select public.cast_vote($1, 0)", [anonPostId]));
    post = await one("select upvotes, downvotes from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(
      post.upvotes === 0 && post.downvotes === 0,
      `cleared vote ${post.upvotes}/${post.downvotes}`,
    );
  });

  await run("reactions toggle on and off", async () => {
    await asUser(ID.a2, () => sql("select public.toggle_reaction($1, '🔥')", [anonPostId]));
    let post = await one("select reactions from public.confessions where id = $1", [anonPostId]);
    assert(post.reactions["🔥"] === 1, `first reaction ${JSON.stringify(post.reactions)}`);
    await asUser(ID.a2, () => sql("select public.toggle_reaction($1, '🔥')", [anonPostId]));
    post = await one("select reactions from public.confessions where id = $1", [anonPostId]);
    assert(!post.reactions["🔥"], `second reaction ${JSON.stringify(post.reactions)}`);
  });

  await checkError(
    "short report reasons are rejected",
    () =>
      asUser(ID.a2, () => sql("select public.report_content('confession', $1, 'x')", [anonPostId])),
    /short reason/,
  );
  await checkError(
    "aliases cannot report their own post",
    () =>
      asUser(ID.a1, () =>
        sql("select public.report_content('confession', $1, 'not mine')", [aliasPostId]),
      ),
    /own content/,
  );

  await run("reports are deduplicated and auto-flag at three", async () => {
    await asUser(ID.a1, () =>
      sql("select public.report_content('confession', $1, 'spam')", [anonPostId]),
    );
    await asUser(ID.a1, () =>
      sql("select public.report_content('confession', $1, 'spam again')", [anonPostId]),
    );
    let post = await one("select report_count, status from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(
      post.report_count === 1 && post.status === "visible",
      `after duplicate ${post.report_count}/${post.status}`,
    );
    await asUser(ID.a2, () =>
      sql("select public.report_content('confession', $1, 'abuse')", [anonPostId]),
    );
    await asUser(ID.a3, () =>
      sql("select public.report_content('confession', $1, 'harassment')", [anonPostId]),
    );
    post = await one("select report_count, status from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(post.report_count === 3, `reports=${post.report_count}`);
    assert(post.status === "flagged", `status=${post.status}`);
    const reports = await one(
      "select count(*)::int as n from public.reports where target_id = $1",
      [anonPostId],
    );
    assert(reports.n === 3, `rows=${reports.n}`);
    const hidden = await asUser(
      ID.a2,
      async () =>
        (await one("select count(*)::int as n from public.confessions where id = $1", [anonPostId]))
          .n,
    );
    const admin = await asUser(
      ID.a1,
      async () =>
        (await one("select count(*)::int as n from public.confessions where id = $1", [anonPostId]))
          .n,
    );
    assert(hidden === 0, `public sees ${hidden}`);
    assert(admin === 1, `admin sees ${admin}`);
  });

  await run("approve restores content, clears reports and writes audit", async () => {
    await asUser(ID.a1, () =>
      sql("select public.moderate('confession', $1, 'approve', 'looks fine')", [anonPostId]),
    );
    const post = await one("select status, report_count from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(post.status === "visible", `status=${post.status}`);
    assert(post.report_count === 0, `reports=${post.report_count}`);
    const reports = await one(
      "select count(*)::int as n from public.reports where target_id = $1",
      [anonPostId],
    );
    assert(reports.n === 0, `report rows=${reports.n}`);
    const audit = await one(
      "select action, reason from public.moderation_actions where target_id = $1 order by created_at desc limit 1",
      [anonPostId],
    );
    assert(
      audit.action === "approve" && audit.reason === "looks fine",
      `audit=${JSON.stringify(audit)}`,
    );
  });

  let anonCommentId;
  let aliasCommentId;
  await run("comments increment the count and respect parent visibility", async () => {
    await asUser(ID.anon, async () => {
      anonCommentId = (
        await one("select public.add_comment($1, 'first comment', false) as id", [anonPostId])
      ).id;
    });
    await asUser(ID.a2, async () => {
      aliasCommentId = (
        await one("select public.add_comment($1, 'alias comment', true) as id", [anonPostId])
      ).id;
    });
    const post = await one("select comment_count from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(post.comment_count === 2, `count=${post.comment_count}`);
    const visible = await asUser(
      ID.a3,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            anonPostId,
          ])
        ).n,
    );
    assert(visible === 2, `visible=${visible}`);
  });

  await run("flagged comments hide from the public but not admins", async () => {
    await asUser(ID.a1, () =>
      sql("select public.report_content('comment', $1, 'spam')", [anonCommentId]),
    );
    await asUser(ID.a2, () =>
      sql("select public.report_content('comment', $1, 'abuse')", [anonCommentId]),
    );
    await asUser(ID.a3, () =>
      sql("select public.report_content('comment', $1, 'harassment')", [anonCommentId]),
    );
    const status = await one("select status from public.comments where id = $1", [anonCommentId]);
    assert(status.status === "flagged", `status=${status.status}`);
    const visible = await asUser(
      ID.a3,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            anonPostId,
          ])
        ).n,
    );
    const admin = await asUser(
      ID.a1,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            anonPostId,
          ])
        ).n,
    );
    assert(visible === 1, `public=${visible}`);
    assert(admin === 2, `admin=${admin}`);
  });

  await run("soft-deleting a comment keeps the row and fixes the count", async () => {
    await asUser(ID.a1, () =>
      sql("select public.moderate('comment', $1, 'delete', 'abusive')", [anonCommentId]),
    );
    const comment = await one("select status, deleted_at from public.comments where id = $1", [
      anonCommentId,
    ]);
    assert(
      comment.status === "deleted" && comment.deleted_at !== null,
      `comment=${JSON.stringify(comment)}`,
    );
    const post = await one("select comment_count from public.confessions where id = $1", [
      anonPostId,
    ]);
    assert(post.comment_count === 1, `count=${post.comment_count}`);
    const reports = await one(
      "select count(*)::int as n from public.reports where target_id = $1",
      [anonCommentId],
    );
    assert(reports.n === 0, `reports=${reports.n}`);
    const visible = await asUser(
      ID.a3,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            anonPostId,
          ])
        ).n,
    );
    assert(visible === 1, `public still sees ${visible}`);
    assert(aliasCommentId !== anonCommentId, "ids collided");
  });

  await run("soft-deleting a confession hides its comments but keeps rows", async () => {
    const seed = await one("select id from public.confessions where body like 'I used to live%'");
    await asUser(ID.a2, () =>
      sql("select public.add_comment($1, 'reply on the seed post', false)", [seed.id]),
    );
    await asUser(ID.a1, () =>
      sql("select public.moderate('confession', $1, 'delete', 'off topic')", [seed.id]),
    );
    const kept = await one("select status, deleted_at from public.confessions where id = $1", [
      seed.id,
    ]);
    assert(kept.status === "deleted" && kept.deleted_at !== null, `row=${JSON.stringify(kept)}`);
    const comments = await asUser(
      ID.a2,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            seed.id,
          ])
        ).n,
    );
    assert(comments === 0, `public comments=${comments}`);
    const adminComments = await asUser(
      ID.a1,
      async () =>
        (
          await one("select count(*)::int as n from public.comments where confession_id = $1", [
            seed.id,
          ])
        ).n,
    );
    assert(adminComments === 1, `admin comments=${adminComments}`);
  });

  await run("alias_stats computes karma and a real score", async () => {
    await asUser(ID.a2, () => sql("select public.cast_vote($1, 1)", [aliasPostId]));
    const stats = await one("select karma, posts, score from public.alias_stats($1)", [ID.a1]);
    assert(Number(stats.karma) === 1, `karma=${stats.karma}`);
    assert(Number(stats.posts) === 1, `posts=${stats.posts}`);
    assert(Number(stats.score) >= 3, `score=${stats.score}`);
  });

  await run("alias moderation is admin-only, audited, and blocks posting", async () => {
    await checkError(
      "member cannot change alias status",
      () => asUser(ID.a2, () => sql("select public.set_alias_status($1, 'warned')", [ID.a3])),
      /Forbidden/,
    );
    await checkError(
      "admin cannot moderate themselves",
      () => asUser(ID.a1, () => sql("select public.set_alias_status($1, 'suspended')", [ID.a1])),
      /own alias/,
    );
    await asUser(ID.a1, () => sql("select public.set_alias_status($1, 'suspended')", [ID.a3]));
    const profile = await one("select status from public.profiles where id = $1", [ID.a3]);
    assert(profile.status === "suspended", `status=${profile.status}`);
    const audit = await one(
      "select action from public.moderation_actions where target_id = $1 order by created_at desc limit 1",
      [ID.a3],
    );
    assert(audit.action === "suspended", `audit=${audit.action}`);
    const notification = await one(
      "select count(*)::int as n from public.notifications where user_id = $1 and type = 'moderation'",
      [ID.a3],
    );
    assert(notification.n === 1, `notifications=${notification.n}`);
    await checkError(
      "suspended alias cannot post",
      () =>
        asUser(ID.a3, () =>
          sql("select public.create_confession('should not land at all', 'Confessions', false)"),
        ),
      /suspended/i,
    );
    await asUser(ID.a1, () => sql("select public.set_alias_status($1, 'active')", [ID.a3]));
  });

  await run("moderation audit is visible to admins only", async () => {
    const admin = await asUser(
      ID.a1,
      async () => (await one("select count(*)::int as n from public.moderation_actions")).n,
    );
    const member = await asUser(
      ID.a2,
      async () => (await one("select count(*)::int as n from public.moderation_actions")).n,
    );
    assert(admin > 0, `admin=${admin}`);
    assert(member === 0, `member=${member}`);
    await checkError(
      "anon role cannot read audit",
      () => asRole("anon", () => sql("select count(*) from public.moderation_actions")),
      /permission denied/,
    );
  });

  await run("forwarded IPs use the proxy-appended hop and a salt", async () => {
    try {
      await sql(
        `select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', false)`,
      );
      const row = await one("select public.request_ip_hash() as h");
      assert(
        row.h !== createHash("md5").update("203.0.113.9").digest("hex"),
        "first hop was trusted",
      );
      assert(row.h !== createHash("md5").update("10.0.0.1").digest("hex"), "hash is unsalted");

      await sql(`select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.1"}', false)`);
      const trusted = await one("select public.request_ip_hash() as h");
      assert(row.h === trusted.h, `hop mismatch ${row.h}/${trusted.h}`);
    } finally {
      await sql("select set_config('request.headers', '', false)");
    }
  });

  await run("write_events records only real writes", async () => {
    const row = await one("select count(*)::int as n from public.write_events");
    assert(row.n > 0, `events=${row.n}`);
  });

  await run("app_settings is private to clients", async () => {
    await checkError(
      "member cannot read app_settings",
      () => asUser(ID.a2, () => sql("select count(*) from public.app_settings")),
      /permission denied/,
    );
    await checkError(
      "anon role cannot read app_settings",
      () => asRole("anon", () => sql("select count(*) from public.app_settings")),
      /permission denied/,
    );
    const setting = await one(
      "select value from public.app_settings where key = 'posting_enabled'",
    );
    assert(setting.value === true, `setting=${JSON.stringify(setting.value)}`);
  });

  await run("posting is open by default", async () => {
    const open = await asRole(
      "anon",
      async () => (await one("select public.posting_open() as open")).open,
    );
    assert(open === true, `open=${open}`);
  });

  await run("feed_page paginates latest posts without overlaps", async () => {
    const first = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', null, null, 2, 0)"),
    );
    const second = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', null, null, 2, 2)"),
    );
    assert(first.length === 2, `first=${first.length}`);
    assert(second.length === 2, `second=${second.length}`);
    const ids = new Set([...first, ...second].map((row) => row.id));
    assert(ids.size === 4, `unique=${ids.size}`);
    const all = await asUser(ID.a2, async () =>
      sql("select id, created_at from public.feed_page('latest', null, null, 50, 0)"),
    );
    for (let i = 1; i < all.length; i += 1) {
      assert(
        new Date(all[i - 1].created_at) >= new Date(all[i].created_at),
        "latest order is not descending",
      );
    }
  });

  await run("feed_page search escapes wildcards and filters categories", async () => {
    const search = await asUser(ID.a2, async () =>
      sql("select body from public.feed_page('latest', null, 'number 2', 50, 0)"),
    );
    assert(
      search.length === 1 && search[0].body === "anonymous confession number 2",
      `search=${JSON.stringify(search)}`,
    );
    const percent = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', null, '%', 50, 0)"),
    );
    assert(percent.length === 0, `percent=${percent.length}`);
    const underscore = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', null, '_', 50, 0)"),
    );
    assert(underscore.length === 0, `underscore=${underscore.length}`);
    const late = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', 'Late Night', null, 50, 0)"),
    );
    assert(late.length === 4, `late=${late.length}`);
    const none = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', 'No Such Category', null, 50, 0)"),
    );
    assert(none.length === 0, `none=${none.length}`);
    const clamped = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('latest', null, null, 999, -10)"),
    );
    assert(clamped.length === 6, `clamped=${clamped.length}`);
    const fallback = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('garbage')"),
    );
    assert(fallback.length === 6, `fallback=${fallback.length}`);
  });

  await run("feed_page following respects follows and RLS", async () => {
    const following = await asUser(ID.a2, async () =>
      sql("select id from public.feed_page('following', null, null, 50, 0)"),
    );
    assert(
      following.length === 1 && following[0].id === aliasPostId,
      `following=${JSON.stringify(following)}`,
    );
    const none = await asUser(ID.a3, async () =>
      sql("select id from public.feed_page('following', null, null, 50, 0)"),
    );
    assert(none.length === 0, `a3 following=${none.length}`);
    const guest = await asUser(ID.anon, async () =>
      sql("select id from public.feed_page('following', null, null, 50, 0)"),
    );
    assert(guest.length === 0, `guest following=${guest.length}`);
    const visible = await asUser(
      ID.a2,
      async () =>
        (await one("select count(*)::int as n from public.confessions where status = 'visible'")).n,
    );
    const feed = await asUser(
      ID.a2,
      async () =>
        (await one("select count(*)::int as n from public.feed_page('latest', null, null, 50, 0)"))
          .n,
    );
    assert(feed === visible, `feed=${feed} visible=${visible}`);
    const anonFeed = await asRole(
      "anon",
      async () =>
        (await one("select count(*)::int as n from public.feed_page('latest', null, null, 50, 0)"))
          .n,
    );
    assert(anonFeed === visible, `anon role feed=${anonFeed} visible=${visible}`);
  });

  await run("kill switch is admin-only and blocks writes while paused", async () => {
    await checkError(
      "non-admin cannot toggle posting",
      () => asUser(ID.a2, () => sql("select public.set_posting_enabled(false)")),
      /Forbidden/,
    );
    const eventsBefore = (await one("select count(*)::int as n from public.write_events")).n;
    await asUser(ID.a1, () => sql("select public.set_posting_enabled(false)"));
    const open = await asRole(
      "anon",
      async () => (await one("select public.posting_open() as open")).open,
    );
    assert(open === false, `open=${open}`);
    await checkError(
      "paused confession rejected",
      () =>
        asUser(ID.a4, () =>
          sql("select public.create_confession('should be paused for now', 'Confessions', false)"),
        ),
      /paused/,
    );
    await checkError(
      "paused comment rejected",
      () =>
        asUser(ID.a4, () =>
          sql("select public.add_comment($1, 'paused comment', false)", [aliasPostId]),
        ),
      /paused/,
    );
    const eventsAfter = (await one("select count(*)::int as n from public.write_events")).n;
    assert(eventsAfter === eventsBefore, `write_events ${eventsBefore} -> ${eventsAfter}`);
    await asUser(ID.a1, () => sql("select public.set_posting_enabled(true)"));
    await asUser(ID.a4, () =>
      sql(
        "select public.create_confession('posting works again after pause', 'Confessions', false)",
      ),
    );
    const openAgain = await asRole(
      "anon",
      async () => (await one("select public.posting_open() as open")).open,
    );
    assert(openAgain === true, `open=${openAgain}`);
    const off = await one(
      "select count(*)::int as n from public.moderation_actions where target_type = 'system' and action = 'posting_off' and target_id is null",
    );
    const on = await one(
      "select count(*)::int as n from public.moderation_actions where target_type = 'system' and action = 'posting_on' and target_id is null",
    );
    assert(off.n === 1 && on.n === 1, `off=${off.n} on=${on.n}`);
  });

  await run("retention cleanup is admin-only and only removes aged rows", async () => {
    await checkError(
      "non-admin cannot run cleanup",
      () => asUser(ID.a2, () => sql("select public.run_retention_cleanup()")),
      /Forbidden/,
    );
    await checkError(
      "clients cannot call the internal cleanup",
      () => asUser(ID.a1, () => sql("select public.retention_cleanup_internal()")),
      /permission denied/,
    );

    await sql(
      "insert into public.write_events (actor_id, action, created_at) values ($1, 'confession', now() - interval '40 days')",
      [ID.a2],
    );
    await sql(
      `insert into public.notifications (user_id, type, message, read, created_at) values
         ($1, 'test', 'aged read', true, now() - interval '120 days'),
         ($1, 'test', 'fresh read', true, now()),
         ($1, 'test', 'aged unread', false, now() - interval '120 days')`,
      [ID.a2],
    );
    await sql(
      `insert into public.reports (target_type, target_id, reporter_key, reason, created_at) values
         ('confession', $1, 'aged-report', 'old', now() - interval '200 days'),
         ('confession', $1, 'fresh-report', 'new', now())`,
      [aliasPostId],
    );

    const result = await asUser(
      ID.a1,
      async () => (await one("select public.run_retention_cleanup() as r")).r,
    );
    assert(result.write_events === 1, `events=${JSON.stringify(result)}`);
    assert(result.notifications === 1, `notifications=${JSON.stringify(result)}`);
    assert(result.reports === 1, `reports=${JSON.stringify(result)}`);

    const agedEvents = await one(
      "select count(*)::int as n from public.write_events where created_at < now() - interval '30 days'",
    );
    const recentEvents = await one(
      "select count(*)::int as n from public.write_events where created_at > now() - interval '1 day'",
    );
    assert(agedEvents.n === 0, `aged events=${agedEvents.n}`);
    assert(recentEvents.n > 0, `recent events=${recentEvents.n}`);
    const kept = await one(
      "select count(*)::int as n from public.notifications where user_id = $1 and type = 'test'",
      [ID.a2],
    );
    const unread = await one(
      "select count(*)::int as n from public.notifications where user_id = $1 and type = 'test' and read = false",
      [ID.a2],
    );
    assert(kept.n === 2, `kept=${kept.n}`);
    assert(unread.n === 1, `unread=${unread.n}`);
    const agedReport = await one(
      "select count(*)::int as n from public.reports where reporter_key = 'aged-report'",
    );
    const freshReport = await one(
      "select count(*)::int as n from public.reports where reporter_key = 'fresh-report'",
    );
    assert(agedReport.n === 0, `aged report=${agedReport.n}`);
    assert(freshReport.n === 1, `fresh report=${freshReport.n}`);

    const serviceResult = await asRole(
      "service_role",
      async () => (await one("select public.retention_cleanup_internal() as r")).r,
    );
    assert(
      serviceResult.write_events === 0 &&
        serviceResult.notifications === 0 &&
        serviceResult.reports === 0,
      `service=${JSON.stringify(serviceResult)}`,
    );
  });

  await run("profile status and cooldown are not client-editable", async () => {
    const priv = await one(`
      select
        has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE') as status,
        has_column_privilege('authenticated', 'public.profiles', 'handle_changed_at', 'UPDATE') as cooldown,
        has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE') as bio
    `);
    assert(priv.status === false, `status=${priv.status}`);
    assert(priv.cooldown === false, `cooldown=${priv.cooldown}`);
    assert(priv.bio === true, `bio=${priv.bio}`);

    await checkError(
      "client cannot set status",
      () =>
        asUser(ID.a2, () =>
          sql("update public.profiles set status = 'active' where id = $1", [ID.a2]),
        ),
      /permission denied/,
    );

    await sql("update public.profiles set status = 'warned' where id = $1", [ID.a2]);
    await sql("grant update on public.profiles to authenticated");
    try {
      await checkError(
        "trigger blocks status if the grant regresses",
        () =>
          asUser(ID.a2, () =>
            sql("update public.profiles set status = 'active' where id = $1", [ID.a2]),
          ),
        /Only moderators/,
      );
    } finally {
      await sql("revoke update on public.profiles from authenticated");
      await sql("grant update (handle, avatar, bio) on public.profiles to authenticated");
      await sql("update public.profiles set status = 'active' where id = $1", [ID.a2]);
    }

    const edited = await asUser(ID.a2, async () => {
      await sql("update public.profiles set bio = 'audit bio' where id = $1", [ID.a2]);
      return (await one("select bio from public.profiles where id = $1", [ID.a2])).bio;
    });
    assert(edited === "audit bio", `bio=${edited}`);
  });

  await run("IP hashing is salted and uses the trusted proxy header", async () => {
    try {
      await sql("select set_config('request.headers', $1, false)", [
        JSON.stringify({
          "cf-connecting-ip": "203.0.113.9",
          "x-forwarded-for": "1.2.3.4, 203.0.113.9",
        }),
      ]);
      const h1 = (await one("select public.request_ip_hash() as h")).h;
      const h2 = (await one("select public.request_ip_hash() as h")).h;
      assert(h1 && h1 === h2, `unstable ${h1}/${h2}`);
      assert(h1 !== createHash("md5").update("203.0.113.9").digest("hex"), "hash is unsalted");

      await sql("select set_config('request.headers', $1, false)", [
        JSON.stringify({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }),
      ]);
      const h3 = (await one("select public.request_ip_hash() as h")).h;
      assert(h3 === h1, `last hop not used ${h1}/${h3}`);

      await sql("select set_config('request.headers', $1, false)", [
        JSON.stringify({ "cf-connecting-ip": "203.0.113.10" }),
      ]);
      const h4 = (await one("select public.request_ip_hash() as h")).h;
      assert(h4 !== h1, "different IP hashed the same");
    } finally {
      await sql("select set_config('request.headers', '', false)");
    }
  });

  await run("approving a visible row with 1-2 reports clears the reports", async () => {
    const post = await one(
      "insert into public.confessions (body, category) values ('Approve audit row', 'Confessions') returning id",
    );
    await sql(
      "insert into public.reports (target_type, target_id, reporter_key, reason) values ('confession', $1, 'audit-reporter', 'spam')",
      [post.id],
    );
    await sql("update public.confessions set report_count = 1 where id = $1", [post.id]);

    await asUser(ID.a1, () =>
      sql("select public.moderate('confession', $1, 'approve', 'fine')", [post.id]),
    );

    const row = await one("select status, report_count from public.confessions where id = $1", [
      post.id,
    ]);
    const reports = await one(
      "select count(*)::int as n from public.reports where target_type = 'confession' and target_id = $1",
      [post.id],
    );
    assert(row.status === "visible" && row.report_count === 0, JSON.stringify(row));
    assert(reports.n === 0, `reports=${reports.n}`);
  });

  await run("leaderboard_page pages in SQL and excludes suspended aliases", async () => {
    await sql("update public.profiles set status = 'suspended' where id = $1", [ID.a4]);
    try {
      const top = await asRole("anon", () => sql("select * from public.leaderboard_page(3, 0)"));
      assert(top.length === 3, `rows=${top.length}`);
      assert(
        top[0].score >= top[1].score && top[1].score >= top[2].score,
        JSON.stringify(top.map((r) => r.score)),
      );
      assert(!top.some((r) => r.id === ID.a4), "suspended alias returned");
      const next = await asRole("anon", () => sql("select id from public.leaderboard_page(3, 3)"));
      assert(!next.some((r) => top.some((t) => t.id === r.id)), "pages overlap");
    } finally {
      await sql("update public.profiles set status = 'active' where id = $1", [ID.a4]);
    }
  });

  await run("feed and detail return viewer-specific vote and reaction state", async () => {
    const post = await one(
      "insert into public.confessions (body, category) values ('Marks audit row', 'Confessions') returning id",
    );
    await sql("insert into public.votes (confession_id, voter_key, value) values ($1, $2, 1)", [
      post.id,
      ID.a2,
    ]);
    await sql(
      "insert into public.reactions (confession_id, voter_key, emoji) values ($1, $2, '🔥')",
      [post.id, ID.a2],
    );

    const mine = await asUser(ID.a2, async () => {
      const rows = await sql(
        "select id, my_vote, my_reactions from public.feed_page('latest', null, 'Marks audit row', 50, 0)",
      );
      return rows.find((r) => r.id === post.id);
    });
    assert(mine && mine.my_vote === 1, JSON.stringify(mine));
    assert(
      Array.isArray(mine.my_reactions) && mine.my_reactions.includes("🔥"),
      JSON.stringify(mine?.my_reactions),
    );

    const other = await asUser(ID.a3, async () => {
      const rows = await sql(
        "select id, my_vote, my_reactions from public.feed_page('latest', null, 'Marks audit row', 50, 0)",
      );
      return rows.find((r) => r.id === post.id);
    });
    assert(other && other.my_vote === 0, JSON.stringify(other));
    assert((other?.my_reactions ?? []).length === 0, JSON.stringify(other?.my_reactions));

    const detail = await asUser(ID.a2, async () => {
      const rows = await sql("select my_vote, my_reactions from public.confession_detail($1)", [
        post.id,
      ]);
      return rows[0];
    });
    assert(detail.my_vote === 1 && detail.my_reactions.includes("🔥"), JSON.stringify(detail));

    const marks = await asUser(ID.a2, async () => {
      const rows = await sql(
        "select my_vote, my_reactions from public.confession_marks(array[$1::uuid])",
        [post.id],
      );
      return rows[0];
    });
    assert(marks.my_vote === 1 && marks.my_reactions.includes("🔥"), JSON.stringify(marks));

    const def = await one(
      "select pg_get_functiondef('public.feed_page(text,text,text,integer,integer)'::regprocedure) as d",
    );
    assert(/least\(\s*coalesce\(_offset,\s*0\),\s*5000\s*\)/i.test(def.d), "offset clamp missing");

    await sql("update public.confessions set status = 'deleted' where id = $1", [post.id]);
    const hidden = await asRole("anon", () =>
      sql("select * from public.confession_detail($1)", [post.id]),
    );
    assert(hidden.length === 0, `deleted visible=${hidden.length}`);
  });

  await run("anonymous conversion creates one alias and keeps the user id", async () => {
    const uid = "00000000-0000-4000-8000-000000000008";
    await sql(
      "insert into auth.users (id, raw_user_meta_data, is_anonymous) values ($1, '{}'::jsonb, true)",
      [uid],
    );
    await sql(
      `update auth.users
       set raw_user_meta_data = '{"handle":"ConvertedGhost","avatar":"🦊"}'::jsonb,
           is_anonymous = false
       where id = $1`,
      [uid],
    );
    const profile = await one("select handle, avatar from public.profiles where id = $1", [uid]);
    assert(profile && profile.handle === "convertedghost", JSON.stringify(profile));
    assert(profile.avatar === "🦊", JSON.stringify(profile));
    const roles = await one("select count(*)::int as n from public.user_roles where user_id = $1", [
      uid,
    ]);
    assert(roles.n === 1, `roles=${roles.n}`);

    await sql("update auth.users set email = 'converted@test.dev' where id = $1", [uid]);
    const count = await one("select count(*)::int as n from public.profiles where id = $1", [uid]);
    assert(count.n === 1, `profiles=${count.n}`);
  });

  await run("security and performance objects are installed", async () => {
    const row = await one(`
      select
        to_regprocedure('public.confession_detail(uuid)') is not null as detail,
        to_regprocedure('public.confession_marks(uuid[])') is not null as marks,
        to_regprocedure('public.leaderboard_page(integer,integer)') is not null as leaderboard,
        to_regclass('public.confessions_visible_created_idx') is not null as feed_idx,
        to_regclass('public.follows_followee_idx') is not null as follows_idx,
        to_regclass('public.notifications_user_created_idx') is not null as notif_idx,
        exists (select 1 from public.app_settings where key = 'ip_hash_salt') as salt,
        exists (select 1 from pg_trigger where tgname = 'on_auth_user_converted') as conversion
    `);
    assert(
      row.detail &&
        row.marks &&
        row.leaderboard &&
        row.feed_idx &&
        row.follows_idx &&
        row.notif_idx,
      JSON.stringify(row),
    );
    assert(row.salt && row.conversion, JSON.stringify(row));
  });

  let replyId;
  await run("replies attach to a parent comment", async () => {
    await asUser(ID.a3, async () => {
      replyId = (
        await one("select public.add_comment($1, 'threaded reply', false, $2) as id", [
          anonPostId,
          aliasCommentId,
        ])
      ).id;
    });
    const row = await one("select parent_id from public.comments where id = $1", [replyId]);
    assert(row.parent_id === aliasCommentId, `parent=${row.parent_id}`);
  });

  await checkError(
    "a reply to a reply is rejected",
    () =>
      asUser(ID.a4, () =>
        sql("select public.add_comment($1, 'nested reply', false, $2)", [anonPostId, replyId]),
      ),
    /one level deep/,
  );

  await checkError(
    "a reply cannot jump confessions",
    () =>
      asUser(ID.a4, () =>
        sql("select public.add_comment($1, 'cross post reply', false, $2)", [
          aliasPostId,
          aliasCommentId,
        ]),
      ),
    /same confession/,
  );

  await run("handover verification query returns expected migration state", async () => {
    const row = await one(`
      with checks as (
        select
          to_regprocedure('public.feed_page(text,text,text,integer,integer)') is not null as feed_page,
          to_regprocedure('public.confession_detail(uuid)') is not null as confession_detail,
          to_regprocedure('public.confession_marks(uuid[])') is not null as confession_marks,
          to_regprocedure('public.leaderboard_page(integer,integer)') is not null as leaderboard_page,
          to_regprocedure('public.posting_open()') is not null as posting_open,
          to_regprocedure('public.set_posting_enabled(boolean)') is not null as kill_switch,
          to_regprocedure('public.run_retention_cleanup()') is not null as retention_cleanup,
          (select (value #>> '{}')::boolean from public.app_settings where key = 'posting_enabled') as posting_enabled,
          exists (select 1 from public.app_settings where key = 'ip_hash_salt') as ip_salt,
          has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE') as client_can_set_status,
          (select is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'moderation_actions' and column_name = 'target_id') as audit_target_nullable,
          exists (select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') as realtime_notifications,
          (select count(*)::int from public.confessions where category = 'Roommates') as roommates_posts,
          (select count(*)::int from public.confessions) as confessions,
          (select count(*)::int from public.comments) as comments
      )
      select * from checks
    `);
    assert(
      row.feed_page && row.posting_open && row.kill_switch && row.retention_cleanup,
      `functions=${JSON.stringify(row)}`,
    );
    assert(
      row.confession_detail && row.confession_marks && row.leaderboard_page,
      `new_functions=${JSON.stringify(row)}`,
    );
    assert(
      row.client_can_set_status === false,
      `client_can_set_status=${row.client_can_set_status}`,
    );
    assert(row.posting_enabled === true, `posting_enabled=${row.posting_enabled}`);
    assert(row.ip_salt === true, `ip_salt=${row.ip_salt}`);
    assert(
      row.audit_target_nullable === "YES",
      `audit_target_nullable=${row.audit_target_nullable}`,
    );
    assert(row.roommates_posts === 0, `roommates=${row.roommates_posts}`);
    assert(row.confessions > 0 && row.comments > 0, `counts=${row.confessions}/${row.comments}`);
  });
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

console.log(results.join("\n"));
console.log(`\n1..${pass + fail}`);
console.log(`# pass ${pass}`);
console.log(`# fail ${fail}`);
await db.close();
if (fail > 0) process.exitCode = 1;
