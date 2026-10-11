import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotification, sendNotification } from "../../scripts/lib/notify.mjs";

const video = {
  id: "abcDEF12345",
  title: "Jesus gibt den perfekten Raphinha-Ersatz: FC Barcelona - FC Getafe | 8. Spieltag | LALIGA | DAZN",
};

test("notification is spoiler-free and deep-links into the app", () => {
  const msg = buildNotification(video, { topic: "t", appUrl: "https://me.github.io/barca" });
  assert.equal(msg.message, "FC Barcelona – FC Getafe\nLaLiga · 8. Spieltag");
  assert.ok(!JSON.stringify(msg).includes("Raphinha"));
  assert.equal(msg.click, "https://me.github.io/barca/#/v/abcDEF12345");
  assert.equal(msg.actions[0].url, "https://www.youtube.com/watch?v=abcDEF12345");
});

test("without app URL the notification opens YouTube", () => {
  assert.equal(buildNotification(video, { topic: "t" }).click, "https://www.youtube.com/watch?v=abcDEF12345");
});

test("sendNotification posts JSON and surfaces errors", async () => {
  let call;
  await sendNotification({ topic: "t" }, {
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response("ok");
    },
  });
  assert.equal(call.url, "https://ntfy.sh");
  assert.equal(JSON.parse(call.init.body).topic, "t");
  await assert.rejects(sendNotification({}, { fetchImpl: async () => new Response("bad", { status: 400 }) }), /400/);
});
