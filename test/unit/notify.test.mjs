import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotification } from "../../scripts/lib/notify.mjs";

const getafe = {
  id: "abcDEF12345",
  title: "Jesus gibt den perfekten Raphinha-Ersatz: FC Barcelona - FC Getafe | 8. Spieltag | LALIGA | DAZN",
};
const betis = { id: "NEWVIDEO001", title: "Krimi: Real Betis - FC Barcelona | 9. Spieltag | LALIGA | DAZN Highlights" };

test("single recap: spoiler-free, carries only the video ID", () => {
  const msg = buildNotification([getafe]);
  assert.equal(msg.title, "New Barça recap");
  assert.equal(msg.body, "FC Barcelona – FC Getafe\nLaLiga · 8. Spieltag");
  assert.deepEqual(msg.ids, ["abcDEF12345"]);
  assert.ok(!JSON.stringify(msg).includes("Raphinha"));
  assert.ok(!JSON.stringify(msg).includes("http"));
});

test("several recaps are combined into one notification", () => {
  const msg = buildNotification([getafe, betis]);
  assert.equal(msg.title, "2 new Barça recaps");
  assert.equal(msg.body, "FC Barcelona – FC Getafe\nReal Betis – FC Barcelona");
  assert.deepEqual(msg.ids, ["abcDEF12345", "NEWVIDEO001"]);
  assert.ok(!msg.body.includes("Krimi"));
});
