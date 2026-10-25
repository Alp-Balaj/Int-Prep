# Brian Brennt content schema

One JSON file per content pack. Several packs may share a `tier.id`; the game merges their nodes and boss questions.

```jsonc
{
  "tier": {
    "id": "agentic",              // one of: agentic | aws | react-python | security | ediscovery | cv
    "name": "Agentic AI",
    "level": 1,                   // 1, 2 or 3 (from the prep doc)
    "tease": "<= 100 chars. A hook, not a summary. e.g. 'Why the demo that wowed the room would leak a client's documents on day one.'"
  },
  "nodes": [
    {
      "id": "agentic.langgraph",  // <tier.id>.<slug>, unique across all packs
      "title": "LangGraph",       // <= 40 chars
      "tease": "<= 100 chars, shown while the node is locked. Written as a cliffhanger: a question or a surprising claim.",
      "primer": {
        // read before the lesson and before the node's first card; builds the mental model so the lesson never lands cold
        "problem": "25-60 words. The problem this matter exists to solve, in plain words, ideally in client terms. No jargon the learner has not met yet.",
        "picture": "40-90 words. The core idea as one mental model: an analogy to something the learner knows (C#, .NET, Angular, Azure DevOps, Elasticsearch, Kafka, SQL Server) and how the pieces fit. Inline **bold** and `code` allowed.",
        "sketch": "optional, <= 12 lines ASCII diagram of the picture. Omit the key if none.",
        "terms": [ { "term": "ReAct", "def": "8-25 words. One plain sentence defining a term the lesson or cards use." } ]   // 3-7 entries, the words a newcomer would trip on
      },
      "inPractice": {
        // shown under the lesson: one concrete, realistic story of a team using this in production
        "setting": "<= 90 chars. Who and at what scale, e.g. 'A food-delivery platform handling 40k orders an hour across 3 cities'.",
        "story": "140-240 words, paragraphs separated by a blank line. Narrative, not a list: the problem they had, what they built with this concept (real config names, numbers, versions where they matter), the moment it bit them or the trade-off they hit, and how it ended. Every mechanism from the lesson that appears is shown doing work. Fictional-but-realistic team; never claim a named real company does something unless verified.",
        "flow": "optional, <= 10 lines ASCII of the request/data flow in this story. Omit the key if none.",
        "takeaway": "10-30 words. The one thing from this story to say in an interview."
      },
      "lesson": {
        "body": "150-300 words. Plain prose, paragraphs separated by a blank line. Inline **bold** and `code` allowed, nothing else. Teach the actual mechanism, not a definition list. Where it helps, map to what the learner already knows: C#, .NET, Angular, Azure DevOps, Elasticsearch, Kafka, SQL Server.",
        "snippet": "optional, <= 24 lines. Real code (Python/HCL/TSX/JSON/bash) or an ASCII diagram. Omit the key if none.",
        "snippetLang": "python | hcl | tsx | json | bash | text | csharp | sql | typescript",
        "source": { "title": "Primary doc page title", "url": "https://..." }   // one authoritative URL, prefer official docs
      },
      "cards": [
        // recall cards, statically graded. Mix types: roughly 50% mc, 25% tf, 25% cloze.
        { "id": "agentic.langgraph.c1", "type": "mc", "prompt": "...", "options": ["A", "B", "C", "D"], "answer": 0, "why": "1-2 sentences. Why the right answer is right AND why the most tempting wrong one is wrong." },
        { "id": "agentic.langgraph.c2", "type": "tf", "prompt": "A statement that is clearly true or false.", "answer": false, "why": "..." },
        { "id": "agentic.langgraph.c3", "type": "cloze", "prompt": "Sentence with exactly one ___ gap.", "answer": "the missing words", "why": "..." }
      ],
      "explain": [
        // spoken against a timer, self-rated against the rubric
        { "id": "agentic.langgraph.e1", "prompt": "Interview-style prompt, e.g. 'Explain to me how LangGraph checkpointing lets an agent pause for human approval.'", "seconds": 120,
          "modelAnswer": "120-200 words, the answer a strong candidate would give out loud.",
          "rubric": ["4-6 short checkable points the answer must hit"] }
      ],
      "scenarios": [
        // decision-making, statically graded; exactly one 'best', the rest 'ok' or 'bad'
        { "id": "agentic.langgraph.s1", "situation": "2-4 sentences of concrete client context (law firm, Fortune 100, documents, deadlines, budgets).", "question": "What do you do?",
          "options": [
            { "text": "...", "verdict": "best", "why": "..." },
            { "text": "...", "verdict": "ok",   "why": "..." },
            { "text": "...", "verdict": "bad",  "why": "..." }
          ] }
      ]
    }
  ],
  "boss": {
    "questions": [
      // timed mock-interview questions for this tier's boss fight, 3 minutes each
      { "id": "agentic.boss.1", "prompt": "The question as an interviewer would ask it.", "seconds": 180,
        "modelOutline": "80-150 words: the shape of a strong answer.",
        "rubric": ["6-8 checkable points"] }
    ]
  }
}
```

Rules
- Every id unique and prefixed as shown. Card/explain/scenario ids use the node id as prefix.
- `mc` has 3-5 options; `answer` is the index. Distractors must be plausible, never jokes.
- Facts must be current as of October 2026. Verify anything that changed after 2024 (framework versions, AWS service names, launch dates) with a web search.
- No filler. Every `why` teaches something.
- Primers come before the detail: define every term the lesson or cards rely on that a newcomer would not know, unless an earlier node in the same tier already defined it.
- Cliffhanger teases: "What happens to your DB password when Terraform state leaks?" not "Terraform state basics".
- Every node has an `inPractice` story, and no two nodes in a pack reuse the same company/setting.
- Run `node /home/alpi/Documents/Projects/Int-Prep/brian-brennt/content/validate.js <file.json>` until it prints OK.
