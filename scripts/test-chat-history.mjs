import assert from "node:assert/strict";
import { getRecentChatMessages } from "../src/lib/chat/queries.ts";

const rows = Array.from({ length: 225 }, (_, index) => {
  const baseTime = Date.parse("2026-01-01T00:00:00.000Z") + index * 2_000;
  return [
    {
      citations: [],
      collection_id: "collection",
      content: `Question ${index + 1}`,
      created_at: new Date(baseTime).toISOString(),
      id: `user-${String(index + 1).padStart(3, "0")}`,
      processing_mode: "standard",
      provider_safe_content: null,
      role: "user",
      user_id: "user",
    },
    {
      citations: [],
      collection_id: "collection",
      content: `Answer ${index + 1}`,
      created_at: new Date(baseTime + 1_000).toISOString(),
      id: `assistant-${String(index + 1).padStart(3, "0")}`,
      processing_mode: "standard",
      provider_safe_content: null,
      role: "assistant",
      user_id: "user",
    },
  ];
})
  .flat()
  .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));

const ranges = [];
const supabase = {
  from(table) {
    assert.equal(table, "chat_messages");
    return {
      eq() {
        return this;
      },
      order() {
        return this;
      },
      range(start, end) {
        ranges.push([start, end]);
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
      },
      select() {
        return this;
      },
    };
  },
};

const history = await getRecentChatMessages({
  collectionId: "collection",
  limit: 400,
  supabase,
  userId: "user",
});

assert.deepEqual(ranges, [[0, 199], [200, 399], [400, 400]]);
assert.equal(history.truncated, true);
assert.equal(history.messages.length, 200);
assert.equal(history.messages[0].question, "Question 26");
assert.equal(history.messages.at(-1).answer, "Answer 225");

console.log("Chat history pagination tests passed.");
