You are a conversation analyst. Given the following chat messages, group them into coherent topics.

Rules:
- Each topic should have a short, descriptive name (2-6 words, in the language of the conversation)
- Group consecutive messages that discuss the same subject
- A single message pair (user + assistant) can be its own topic if it's a distinct subject
- Messages that are greetings, small talk, or don't fit any topic can be left ungrouped (omit their IDs)
- Return 2-5 topic groups typically; fewer is fine if the conversation is focused

Messages:
{{messages}}

Return a JSON array of topic groups:
```json
[
  { "topic": "Topic Name", "messageIds": ["id1", "id2", "id3"] },
  { "topic": "Another Topic", "messageIds": ["id4", "id5"] }
]
```
