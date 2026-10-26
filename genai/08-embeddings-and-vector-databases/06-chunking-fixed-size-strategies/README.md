# Module 06: Chunking: Fixed-Size Strategies

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. So far you know what an embedding is ([Module 00](../00-what-an-embedding-is/README.md)), how sentence models produce one ([Module 01](../01-from-word2vec-to-sentence-embeddings/README.md)), how to choose a model and why its input limit matters ([Module 02](../02-embedding-models-compared/README.md)), how vectors are compared ([Module 03](../03-cosine-similarity-and-distance-metrics/README.md)), what dimension costs ([Module 04](../04-the-curse-of-dimensionality/README.md)), and how to push a corpus through a model reliably ([Module 05](../05-generating-embeddings-at-scale/README.md)). Module 05 ended on a warning: text beyond a model's input limit is silently cut, and the real fix for long documents is chunking. This module is that fix in its simplest form.

After this module you can:

- explain the three separate limits that force you to split documents before embedding them;
- cut text into fixed windows by characters, words or tokens, and say what each unit does and does not guarantee;
- show with real examples how a fixed window cuts sentences and ideas in half, and predict how often it happens (about answer length divided by window size);
- build a small labelled corpus and a from-scratch TF-IDF retriever, then sweep chunk size against the score that matters: is the whole answer inside the context the LLM receives?
- read such a sweep critically: why recall at a fixed `k` flatters big chunks, why a fixed LLM budget produces a sweet spot, and why the embedder's input limit moves it.

Why it matters: chunk size is the first decision in every retrieval pipeline and one of the most expensive to change later, because every chunk gets its own vector, so a new size means re-embedding the corpus ([Module 05](../05-generating-embeddings-at-scale/README.md) keys its cache by the exact text). A better model or database cannot recover an answer that was cut in half before it was embedded.

Scope: fixed windows only. Repeating text across neighbouring chunks (overlap) and attaching context such as titles (metadata) are [Module 08](../08-chunk-overlap-and-metadata/README.md); splitting at sentence, heading or topic boundaries is [Module 07](../07-chunking-semantic-and-structural/README.md). This module points forward to both at the places where fixed windows hurt.

## Concept

> [!key] A fixed-size chunker cuts text every N units without reading it, so N is a bet: small enough that the embedder reads the whole chunk, each vector is about one thing and several chunks fit in the LLM's budget, yet large enough that answers are rarely cut in half and a chunk still says what it is about. Measure N with "is the whole answer in the context?" as the score; do not guess it.

## Explanation

### Why a document has to be cut up at all

Three different limits, each one enough on its own:

1. **The embedding model reads a limited number of tokens.** The Sentence-Transformers documentation states that each model has a maximum sequence length and that "Longer texts will be truncated to the first `model.max_seq_length` tokens"; its own example for `all-MiniLM-L6-v2` prints 256 (page fetched Oct 2026; other models differ, so read your model's card, see [Module 02](../02-embedding-models-compared/README.md)). With a truncating model, everything after that point is invisible to search (some hosted APIs reject over-long input instead; see [Module 05](../05-generating-embeddings-at-scale/README.md)). [Module 05](../05-generating-embeddings-at-scale/README.md), Practice 1, showed an edit past the limit that never reached the index.
2. **One text becomes one vector, and a vector is the unit you can retrieve.** If a whole handbook is one vector, the best retrieval can do is hand you the handbook. The unit you index sets the granularity of every answer. *Dense X Retrieval* (Chen et al., 2023) makes this its subject: the choice of retrieval unit (document, passage, sentence, or the "proposition" the authors propose) is a design decision that affects both retrieval and the downstream question-answering result.
3. **The LLM can only use what fits, and it uses a long context unevenly.** You pay per input token ([Track 01, Module 12](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md)), the context window is finite ([Module 11](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md)), and *Lost in the Middle* (Liu et al., 2023) reports that models tend to do best when the relevant information is at the start or end of a long input and worse when it sits in the middle. Retrieval exists to *narrow* the context; a chunk the size of a document narrows nothing.

So you cut the text so that the embedder reads every chunk in full, each vector is about one thing, and several chunks fit in the LLM's budget. The rest of this module is about what the cutting itself costs.

### Choosing the unit: characters, words or tokens

"Split every 1,000" means nothing until you say 1,000 of what.

| Unit | How you count | What it guarantees | What it costs you |
| --- | --- | --- | --- |
| Characters | `len(text)` | An exact size in storage; no dependency; works for every language | Tokens per character vary a lot with content (block 4: 1,000 characters of prose are about 188 approximate tokens, of log lines about 318), so it cannot promise to fit the embedder's limit. Cuts through the middle of words (block 3: 64% of the boundaries) |
| Words | split on whitespace | Never cuts a word; no dependency | Tokens per word vary even more (block 4: 200 words of prose are about 226 approximate tokens, 200 words of logs about 867), and it breaks for scripts written without spaces (block 4: 320 Chinese characters count as 1 word) |
| Tokens | the embedding model's own tokenizer | Matches what the limit and the bill count | Needs the tokenizer, and the *right* one: token counts differ between models ([Track 01, Module 07](../../01-tokens-and-language-modeling/07-comparing-tokenizers-across-models/README.md)). Slower. With subword tokenizers a window can still end inside a word |

In this module's code, "token" means a cheap **approximation**: a run of letters and digits, or a single punctuation mark (the regular expression `\w+|[^\w\s]`). Neither `tiktoken` nor `transformers` is available where the code was run. This approximation counts every punctuation mark as a token, keeps long numbers whole, and treats an unbroken run of Chinese characters as one token. Real tokenizers split rare words into pieces and differ from each other, so a limit stated in real tokens cannot be checked with these counts. The shapes of the results carry over; the exact numbers do not. Real tokenizers are covered in [Track 01](../../01-tokens-and-language-modeling/00-what-is-a-token/README.md) (and [multilingual behaviour in Module 14](../../01-tokens-and-language-modeling/14-multilingual-tokenization/README.md)); the end of the Code section shows the one function to replace.

> [!pitfall] Equal "nominal" sizes are not equal sizes. Sizing chunks as 1,400 characters because "256 tokens is about 1,400 characters" works on average and fails on a lot of individual chunks: in Practice 1, 78% of those chunks exceeded 256 tokens, the embedder silently dropped their tails, and the hit rate fell from 0.906 (chunks sized in tokens) to 0.838. Count in the unit the limit is written in, with the model's own tokenizer, and keep a margin.

### What a fixed window does to your text

The algorithm is three lines: step along the text N units at a time, emit each window, and let the last one be shorter. It never looks at the content: no sentence ends, no headings, no sense of what belongs together. That is why it is fast, deterministic and language-agnostic, and also why it is the baseline that smarter splitters must beat ([Module 07](../07-chunking-semantic-and-structural/README.md)). Common libraries offer it: LlamaIndex's `TokenTextSplitter` is documented as splitting "to a consistent chunk size according to raw token counts", and LangChain's text-splitter overview lists length-based splitting by characters or by tokens (check each library's documentation for exactly what it does on top of that).

> [!model] A guillotine that falls every N units along a conveyor belt of text. Whatever is under the blade when it falls is cut, whether it is a space between words or the middle of a number. You cannot aim it; you can only choose how often it falls.

Block 3 shows real cuts from the corpus. Three things stand out:

- Characters can cut inside a word (`incid[CUT]ent`): with 600-character windows, 64% of the boundaries did. Words and tokens never split a word, but 93 to 96% of boundaries still fall somewhere other than the end of a sentence.
- A cut does not always destroy the fact. In the second example the fact ("64 KB") survives in the first half. In the first, the value ("30 minutes") is in the second half and the first half is a fragment that says almost nothing. The procedure example shows the quieter damage: the first chunk teaches "create a new key", and the step "delete the old key" is in the next chunk, which a retriever may or may not also return.
- How often a cut lands on an answer is predictable. A window of `W` units cuts an answer `L` units long with probability about `L / W` when `L < W`, and almost always when `L >= W`. Block 6 measures it: for windows of 16, 64 and 256 tokens, 82%, 22% and 6.5% of answers were cut, against 86%, 25% and 6.2% predicted. To cut at most 10% of your answers you need a window about ten times the answer length: about 145 tokens for the 14-token facts here, but about 430 for the 43-token three-step procedure, which is already above a 256-token embedder's limit. No single fixed size serves both, which is the opening for the structure-aware splitting of [Module 07](../07-chunking-semantic-and-structural/README.md) and the overlap of [Module 08](../08-chunk-overlap-and-metadata/README.md).

The block 6 "ceiling" is the share of questions whose whole answer sits inside some chunk. It is an upper bound on any retriever you could plug in: a cut answer cannot be recovered by a better ranking, a larger `k` or a better model. Practice 2 shows `k = 30` failing to beat it.

### The size trade-off, measured

The experiment: 40 look-alike "service handbooks" of about 1,300 approximate tokens each, 800 questions whose answers are single sentences (or, for 40 of them, a three-sentence procedure) with their exact character positions recorded, and a TF-IDF retriever written from scratch. The score is strict: a question counts as answered only if **the whole answer sits inside one chunk that was handed to the LLM, from the right handbook**. A looser score ("at least half of the answer is inside one chunk") is reported next to it.

#### Small chunks: precise, but they lose the answer and the subject

- **The answer is cut.** The ceiling (the share of answers that sit whole inside some chunk, block 6) is 0.181 at 16 tokens, 0.776 at 64 and 0.935 at 256.
- **The subject is left behind.** The handbooks name their service ("Orion") in the title and in a few sentences, then say "the service" or "it". A small chunk can hold the answer sentence without saying whose answer it is, and the retriever cannot tell Orion's key-expiry sentence from the near-identical sentences in the other 39 handbooks. Block 9 splits the questions whose answer sits whole inside a chunk by whether that chunk names the service. At 32 tokens, the hit rate (top 3) is 0.982 when it does and 0.261 when it does not.
- **There are more vectors to store and search.** 3,343 chunks at 16 tokens against 40 at whole-document size, for the same text.
- **A bigger `k` cannot repair it** (Practice 2).

#### Large chunks: complete, but diluted, capped and expensive

- **Fixed-`k` recall flatters big chunks.** In block 7, the hit rate with the top 3 chunks climbs from 0.077 (16 tokens) to 0.979 (512 tokens) to 1.000 (whole documents). But the LLM is handed 47, 1,161 and 3,921 tokens. A chunk the size of a document "finds" everything because it contains everything. Always read the hit rate next to the tokens it cost.
- **Dilution.** One vector has to summarise everything in its chunk. In block 9 the mean cosine between a question and the text around its answer falls from 0.526 (the answer sentence alone) to 0.319 (about 128 tokens around it) to 0.203 (about 1,024). Your embedding model is not TF-IDF and will dilute differently, but the direction is the same. In the sweep, hit@3 falls from 0.979 at 512 tokens to 0.925 at 1,024 even though the LLM receives more text; this sweep cannot separate dilution from the other effects of chunk boundaries, so treat that as consistent with dilution rather than proof of it.
- **The input-limit cliff.** With a 256-token embedder, hit@3 is 0.920 at 256 tokens and 0.774 at 384: the embedder never sees the last 128 tokens of each chunk, yet the LLM would be sent them.
- **Waste.** Every extra token is billed and competes for the LLM's attention.

#### A fixed LLM budget gives a sweet spot

Fix the budget instead of `k`: hand the LLM as many whole chunks as fit in `B` tokens. Now big chunks pay for their size, because fewer fit. Block 8 sweeps `B` from 256 to 2,048 tokens with the 256-token embedder. The best size is 128 tokens for `B = 256` and 256 tokens for `B = 512`, `1,024` and `2,048`. The curve rises steeply up to about 128 to 192 tokens, is flat near 256, then falls: chunks past the embedder's limit are partly invisible, and chunks near the budget leave room for almost nothing else (a 768-token chunk does not fit into `B = 512`; the 0.051 comes from the few short last chunks that do). Across eight differently seeded corpora (block 10) the best size was 192 or 256 every time, with a standard deviation of at most 0.023.

Three levers decide where the peak sits:

1. **How long the answers are.** At `B = 512`, one-sentence answers reach 0.909 at 256 tokens while the three-sentence procedure reaches 0.850; at 128 tokens the gap is 0.837 against 0.675.
2. **The embedder's input limit.** Practice 3 moves it to 128, 256 and 512, and the best size follows it each time.
3. **The LLM budget.** A bigger budget lets bigger chunks (and more of them) fit.

> [!model] A card index. Tiny cards (one phrase each) lose the heading and split sentences; giant cards (a chapter each) are hard to find things on, and you carry a stack of them to every question. The right card size depends on the size of the answers, the size of your pockets (the LLM's budget) and the width of the slot in the card box (the embedder's input limit).

> [!pitfall] Do not copy a chunk size from a tutorial, a library default, or this module. The 192 to 256 range here is a property of this corpus (14-token answers), this retriever, a 256-token input limit and a 512-token budget. It is a worked method, not a recommendation.

### What this experiment can and cannot tell you

**A toy corpus and TF-IDF are stand-ins for real documents and a real embedding model. The shape of the curves is the lesson, not the exact numbers.** In particular:

- The handbooks are synthetic and far more regular than real documents (no tables, code, lists or scanned PDFs), and every section opens by naming the service, which makes context loss unusually visible.
- TF-IDF matches words, not meanings. A real embedding model also matches paraphrases and dilutes by its own mechanism (see [Module 02](../02-embedding-models-compared/README.md) for how models differ).
- The score says whether the answer is in the context, not whether the LLM answers well. A model can answer from half a sentence, or fail with the whole one.
- The strict score is conservative: the looser "half" column in block 7 is higher at every size below whole documents, but it has the same shape.
- Nothing here predicts your optimum. The Project asks you to find it on your own documents.

## Code

Copy the blocks in order into one file, `chunking_lab.py`, and run it. It needs Python and numpy only (outputs below were produced with Python 3.13.14 and numpy 2.4.6) and takes about 40 seconds. Everything is seeded by the corpus generator, so the numbers reproduce exactly. The Practice code continues the same file.

### 1. A corpus with known answer locations

Forty look-alike "service handbooks" share one skeleton of twelve sections (in random order, with random boilerplate between them) and differ in service names, nouns and numbers. Twenty sentences per handbook are *answers* whose character positions are recorded when the text is built. Some other sentences share vocabulary with the questions without answering them, so retrieval has something to be fooled by.

```python
import random, re
import numpy as np

# ---- A synthetic corpus: 40 service handbooks with the SAME skeleton and DIFFERENT facts ----
NAMES = ("Orion Vega Lyra Atlas Nimbus Quill Helix Ember Cobalt Juniper Aurora Basalt Cinder Delta Echo Fjord Garnet "
         "Harbor Indigo Jasper Kestrel Lumen Meridian Nova Onyx Pylon Quartz Raven Sable Tundra Umber Vertex Willow Xenon "
         "Yarrow Zephyr Argon Beacon Cedar Dune").split()
THINGS = ("message invoice report file job document event alert request ticket order payment image record task "
          "notification session shipment review reading").split()
SERVICES = [(n, THINGS[i % len(THINGS)]) for i, n in enumerate(NAMES)]      # each noun is shared by two services

GENERAL = [  # boilerplate that every handbook shares; it carries no answers
    "The service runs in three regions and is designed to tolerate the loss of any one of them.",
    "Operators can inspect the current state from the console at any time.",
    "Changes to this behaviour are announced in the release notes at least two weeks in advance.",
    "Most teams never need to change the defaults described here, and we recommend leaving them alone.",
    "Contact the platform team if your workload needs different settings from the ones listed below.",
    "All times in this document are in UTC unless stated otherwise.",
    "These settings apply to every environment, including staging, although staging may be restarted without notice.",
    "The console shows the same numbers that the API reports, so either can be used for dashboards.",
    "Teams are responsible for reading this page before they build a new integration on top of the service.",
    "If something here looks wrong or out of date, open a documentation request and tag the owning team.",
    "Historical versions of this page are available from the wiki for anyone who needs to compare behaviour over time.",
    "Customers on the enterprise plan can ask for exceptions, which are reviewed once a week by the platform group.",
    "Internal tools may use different defaults, but those tools are not covered by the guarantees on this page.",
    "A short summary of each change is also posted to the platform channel when it goes live.",
]

# section -> (an opening sentence that names the service, topical sentences that share vocabulary with the questions but answer none)
SECTIONS = {
    "Overview": ("{N} is the platform component that handles every {t} sent by product teams.",
                 ["This handbook is maintained by the service owners and reviewed every quarter."]),
    "Limits": ("Limits protect the shared infrastructure behind {N}.",
               ["Customers who regularly reach their limits should talk to the platform team about a higher plan."]),
    "Retries": ("{N} never drops a {t} silently.",
                ["Every retry is logged, so operators can see why a delivery was delayed.",
                 "Retries never reorder deliveries for the same customer."]),
    "Security": ("Clients authenticate with API keys, which {N} stores only as salted hashes.",
                 ["Rotate keys regularly, and never share a key between environments.",
                  "Leaked keys can be revoked immediately from the console."]),
    "Storage": ("{N} encrypts all data at rest.",
                ["Retention can be shortened, but never extended, for an individual customer on request.",
                 "Deleted data cannot be recovered after the retention period has ended."]),
    "Monitoring": ("Every {N} instance reports its health to the shared monitoring system.",
                   ["Dashboards for every metric are provided in the console.",
                    "Alerts are routed to the on-call engineer through the paging system."]),
    "Deployment": ("{N} is released several times a week.",
                   ["Deployments are paused automatically during incidents and freeze periods.",
                    "If error rates rise during the canary phase, the release is rolled back automatically.",
                    "Every release is tagged and can be traced to a single change."]),
    "Incidents": ("The {N} on-call rotation is staffed around the clock.",
                  ["Incident commanders are chosen from the on-call rotation.",
                   "Status updates are posted to the incident channel every thirty minutes."]),
    "Billing": ("{N} usage is metered per customer.",
                ["Usage is reported monthly in the console.", "Credits can be applied to a team by the finance group."]),
    "Networking": ("{N} is reachable only from inside the company network.",
                   ["All traffic is encrypted in transit, and plain connections are refused.",
                    "Allow-lists are managed per customer in the console."]),
    "Support": ("Questions about {N} can be raised in the platform channel.",
                ["Support is available through the portal and through the on-call channel.",
                 "Please include the request id with every support ticket."]),
    "Compliance": ("{N} is covered by the annual compliance audit.",
                   ["Auditors can request a copy of the compliance report through the owning team.",
                    "Data residency settings can only be changed by the platform group."]),
}

# (section, answer sentence, question, possible values for {v}); the ANSWER sentence is what retrieval must deliver
FACTS = [
    ("Overview", "It is owned by the {v} team.", "Which team owns {N}?", ["Data", "Edge", "Core", "Growth", "Trust", "Infra"]),
    ("Limits", "{N} accepts at most {v} KB per {t}, and larger payloads are rejected with an error.",
     "What is the maximum size of a {t} that {N} accepts?", [64, 128, 256, 512, 1024]),
    ("Limits", "Each customer may send up to {v} {t}s per second before throttling begins.",
     "How many {t}s per second can one customer send to {N} before throttling?", [50, 100, 200, 500, 1000]),
    ("Retries", "When delivery fails, the service retries with exponential backoff, starting from a {v}-second delay.",
     "What is the initial retry backoff in {N}?", [1, 2, 5, 10, 30]),
    ("Retries", "After {v} failed attempts a {t} is moved to the dead-letter queue.",
     "After how many failed attempts does {N} move a {t} to the dead-letter queue?", list(range(3, 13))),
    ("Security", "Keys expire after {v} days and must be rotated before then.",
     "After how many days do {N} API keys expire?", [30, 60, 90, 180, 365]),
    ("Security", "To rotate the {N} key, open the console and choose Keys. Click Create new key and copy the secret, "
     "which is shown only once. Then delete the old key after confirming that every client uses the new one.",
     "How do I rotate an API key for {N}?", [None]),                       # a three-sentence answer
    ("Storage", "Audit logs are retained for {v} days and then deleted automatically.",
     "How many days does {N} keep audit logs?", [14, 30, 45, 90, 400]),
    ("Storage", "Backups run every {v} hours and are kept in a separate region.",
     "How often does {N} run backups?", [2, 3, 6, 12, 24]),
    ("Monitoring", "The service exposes metrics on port {v} in Prometheus format.",
     "Which port does {N} expose metrics on?", list(range(9100, 9200))),
    ("Monitoring", "An alert fires when p99 latency exceeds {v} milliseconds for five minutes.",
     "What p99 latency makes {N} raise an alert?", [150, 250, 400, 800, 1200]),
    ("Deployment", "{N} is deployed with a rolling update that replaces {v} percent of the pods at a time.",
     "What share of pods does a {N} rolling update replace at a time?", [10, 20, 25, 50]),
    ("Deployment", "Each release is first sent to a canary group for {v} minutes.",
     "How long does a {N} release stay in the canary group?", [5, 10, 15, 30, 45]),
    ("Incidents", "A severity-1 incident must be acknowledged within {v} minutes of the first page.",
     "Within how many minutes must a severity-1 incident for {N} be acknowledged?", [5, 10, 15, 30]),
    ("Incidents", "A written post-incident review is published within {v} days of the incident being closed.",
     "Within how many days is the post-incident review for {N} published?", [3, 5, 7, 10, 14]),
    ("Billing", "The first {v} {t}s each month are free, and every {t} after that is charged to the owning team.",
     "How many {t}s per month are free on {N}?", [1000, 5000, 10000, 50000]),
    ("Networking", "Clients reach {N} on port {v}, while metrics are served on a different port.",
     "Which port do clients use to reach {N}?", list(range(8000, 8100))),
    ("Networking", "Connections to {N} must use TLS {v} or newer.",
     "Which minimum TLS version does {N} require?", ["1.2", "1.3"]),
    ("Support", "Support requests about {N} are answered within {v} business hours.",
     "Within how many business hours are {N} support requests answered?", [2, 4, 8, 24]),
    ("Compliance", "By default, {N} keeps customer data in the {v} region.",
     "Which region does {N} keep customer data in by default?", ["eu-west", "us-east", "ap-south", "sa-east"]),
]

def make_corpus(seed=7):
    """Returns (docs, questions). docs: {name: text}. Each question records the exact character span
    [start, end) of the sentence(s) that answer it, so every answer location is known."""
    rng = random.Random(seed)
    docs, questions = {}, []
    for N, t in SERVICES:
        text = f"# {N} service handbook\n\n"
        sections = list(SECTIONS)
        sections = sections[:1] + rng.sample(sections[1:], len(sections) - 1)    # Overview first, the rest shuffled
        for title in sections:
            named, topical = SECTIONS[title]
            items = [(named, None)]                                              # the section opens by naming the service
            rest = [(s, None) for s in rng.sample(topical, rng.randint(1, len(topical)))]
            rest += [(s, None) for s in rng.sample(GENERAL, rng.randint(2, 4))]
            for sec, sentence, question, values in FACTS:
                if sec == title:
                    rest.append((sentence, (question, rng.choice(values))))
            rng.shuffle(rest)
            text += f"## {title}\n\n"
            body = ""
            for sentence, fact in items + rest:
                v = fact[1] if fact else None
                s = sentence.format(N=N, t=t, v=v)
                if fact:
                    start = len(text) + len(body)
                    questions.append(dict(doc=N, kind="procedure" if "Click Create" in s else "fact",
                                          q=fact[0].format(N=N, t=t), start=start, end=start + len(s)))
                body += s + " "
            text += body.rstrip() + "\n\n"
        docs[N] = text
    for qu in questions:                       # sanity check: the recorded span is a whole sentence of the right document
        assert docs[qu["doc"]][qu["start"]:qu["end"]].endswith(".")
    return docs, questions

docs, questions = make_corpus(seed=7)
print(len(docs), "documents,", sum(map(len, docs.values())), "characters,", len(questions), "questions")
print("    " + "\n\n".join(docs["Orion"].split("\n\n")[:3]).replace("\n", "\n    "), "\n    [...]\n")
q = questions[4]
print("Q:", q["q"])
print("answer span:", q["start"], "to", q["end"], "->", repr(docs[q["doc"]][q["start"]:q["end"]]))
```

Output:

```
40 documents, 281884 characters, 800 questions
    # Orion service handbook

    ## Overview

    Orion is the platform component that handles every message sent by product teams. These settings apply to every environment, including staging, although staging may be restarted without notice. Operators can inspect the current state from the console at any time. This handbook is maintained by the service owners and reviewed every quarter. Most teams never need to change the defaults described here, and we recommend leaving them alone. It is owned by the Data team.
    [...]

Q: After how many days do Orion API keys expire?
answer span: 1672 to 1730 -> 'Keys expire after 30 days and must be rotated before then.'
```

### 2. Three fixed-size chunkers

Each chunker returns character offsets into the original text instead of new strings, so a chunk can always be compared with an answer's position. `token_spans` is the single place that defines what a token is.

```python
# ---- Three fixed-size chunkers. Each returns (start, end) character offsets into the ORIGINAL text, so we always
# ---- know exactly which characters a chunk covers and can compare that with an answer span.
TOKEN_RE = re.compile(r"\w+|[^\w\s]")   # APPROXIMATE token: a run of letters/digits, or one punctuation mark
WORD_RE = re.compile(r"\S+")            # a "word": any run of non-whitespace

def token_spans(text):
    """(start, end) of every approximate token. This is the ONE place to swap in a real tokenizer (see the end of this module)."""
    return [m.span() for m in TOKEN_RE.finditer(text)]

def n_tokens(text):
    return len(token_spans(text))

def _windows(spans, size):
    """Group consecutive (start, end) spans `size` at a time -> one (start, end) per group."""
    return [(spans[i][0], spans[min(i + size, len(spans)) - 1][1]) for i in range(0, len(spans), size)]

def chunk_chars(text, size):
    return [(i, min(i + size, len(text))) for i in range(0, len(text), size)]

def chunk_words(text, size):
    return _windows([m.span() for m in WORD_RE.finditer(text)], size)

def chunk_tokens(text, size):
    return _windows(token_spans(text), size)

CHUNKERS = {"chars": chunk_chars, "words": chunk_words, "tokens": chunk_tokens}

def make_chunks(docs, how, size):
    """-> a list of {doc, start, end, text} dicts covering every document."""
    return [dict(doc=name, start=s, end=e, text=text[s:e])
            for name, text in docs.items() for s, e in CHUNKERS[how](text, size)]

per_doc = [n_tokens(t) for t in docs.values()]
print("approximate tokens per document: min", min(per_doc), "| max", max(per_doc), "| total", sum(per_doc))
for how, size in (("chars", 600), ("words", 100), ("tokens", 128)):
    print(f"{how:>6} x {size}: {len(make_chunks(docs, how, size)) / len(docs):.1f} chunks per handbook on average")
```

Output:

```
approximate tokens per document: min 1245 | max 1470 | total 53175
 chars x 600: 12.3 chunks per handbook on average
 words x 100: 12.3 chunks per handbook on average
tokens x 128: 10.9 chunks per handbook on average
```

### 3. Real cuts, and where the boundaries fall

```python
# ---- Where do the cuts fall? ----
def with_cuts(text, spans, q):
    """The answer sentence(s), with [CUT] at every chunk boundary that falls inside them."""
    out, prev = "", q["start"]
    for m in sorted({e for s, e in spans if q["start"] < e < q["end"]}):
        out += text[prev:m] + "[CUT]"
        prev = m
    return out + text[prev:q["end"]]

def first_cut(how, size, kind, skip=0):
    cut = [q for q in questions if q["kind"] == kind and
           not any(s <= q["start"] and q["end"] <= e for s, e in CHUNKERS[how](docs[q["doc"]], size))]
    return cut[skip]

for how, size, kind, skip in (("chars", 400, "fact", 0), ("tokens", 64, "fact", 0), ("tokens", 64, "fact", 1), ("tokens", 64, "procedure", 0)):
    q = first_cut(how, size, kind, skip)
    print(f"{how} x {size}, {kind} question: {q['q']}")
    print("  ", with_cuts(docs[q["doc"]], CHUNKERS[how](docs[q["doc"]], size), q), "\n")

def boundary_stats(how, size):
    """Share of chunk boundaries that split a word, and share that are not at the end of a sentence."""
    total = mid_word = mid_sentence = 0
    for text in docs.values():
        for s, e in CHUNKERS[how](text, size)[:-1]:
            total += 1
            mid_word += text[e - 1].isalnum() and text[e].isalnum()
            mid_sentence += text[:e].rstrip()[-1] not in ".!?"
    return mid_word / total, mid_sentence / total

print(f"{'unit':>8} {'size':>5} {'avg tokens':>11} {'splits a word':>14} {'not at sentence end':>20}")
for how, size in (("chars", 600), ("words", 100), ("tokens", 128)):
    ch = make_chunks(docs, how, size)
    mw, ms = boundary_stats(how, size)
    print(f"{how:>8} {size:>5} {np.mean([n_tokens(c['text']) for c in ch]):>11.0f} {mw:>13.0%} {ms:>19.0%}")
```

Output:

```
chars x 400, fact question: Within how many minutes must a severity-1 incident for Orion be acknowledged?
   A severity-1 incid[CUT]ent must be acknowledged within 30 minutes of the first page.

tokens x 64, fact question: What is the maximum size of a message that Orion accepts?
   Orion accepts at most 64 KB per message, and larger payloads are[CUT] rejected with an error.

tokens x 64, fact question: How many messages per month are free on Orion?
   The first 10000 messages each month are free, and[CUT] every message after that is charged to the owning team.

tokens x 64, procedure question: How do I rotate an API key for Vega?
   To rotate the Vega key, open the console and choose Keys. Click Create new key and copy the secret, which is shown only once[CUT]. Then delete the old key after confirming that every client uses the new one.

    unit  size  avg tokens  splits a word  not at sentence end
   chars   600         109           64%                 96%
   words   100         108            0%                 93%
  tokens   128         122            0%                 95%
```

`[CUT]` marks a chunk boundary inside an answer. The table counts every boundary in the corpus for roughly 110 to 120-token chunks: only character windows split words, and nearly every boundary of every unit falls mid-sentence.

### 4. What each unit costs

The same nominal size on three kinds of text: the corpus prose, a JSON configuration and some log lines. Each cell is an average over chunks. The last line shows what whitespace splitting does to a language written without spaces.

```python
# ---- What does each unit cost you? The same "size" means different things on different text. ----
import json

prose = docs["Orion"]
config = json.dumps({f"svc{i}": {"retry": {"max_attempts": 3 + i % 4, "backoff_ms": [100, 200, 400]},
                                 "url": f"https://svc{i}.internal.example.com/v1/items?limit=100&cursor=a{i}",
                                 "flags": {"tls": True, "batch": False}} for i in range(60)}, indent=2)
logs = "\n".join(f"2026-10-26T10:{i % 60:02d}:07.{i * 37 % 1000:03d}Z INFO queue.worker id=req-{i * 7919 % 100000:05d} "
                 f"latency_ms={i * 13 % 900} status={200 if i % 9 else 503}" for i in range(200))

def mean_sizes(text, how, size):
    """For chunks of `size` units, the average size of those chunks in characters, words and approximate tokens."""
    spans = CHUNKERS[how](text, size)[:-1]                                  # drop the short last chunk
    parts = [text[s:e] for s, e in spans]
    return tuple(np.mean(m) for m in ([len(p) for p in parts], [len(p.split()) for p in parts], [n_tokens(p) for p in parts]))

print(f"{'text':>6} | 1000 chars = words / tokens | 200 words = chars / tokens | 256 tokens = chars / words")
for name, text in (("prose", prose), ("config", config), ("logs", logs)):
    _, w1, t1 = mean_sizes(text, "chars", 1000)
    c2, _, t2 = mean_sizes(text, "words", 200)
    c3, w3, _ = mean_sizes(text, "tokens", 256)
    print(f"{name:>6} | {w1:>16.0f} / {t1:<8.0f} | {c2:>15.0f} / {t2:<7.0f} | {c3:>15.0f} / {w3:<4.0f}")

zh = "向量数据库可以存储嵌入向量，并且能够快速检索与查询最相似的内容。" * 10
print("\nChinese text:", len(zh), "characters ->", len(zh.split()), "whitespace word,", n_tokens(zh), "approximate tokens")
```

Output:

```
  text | 1000 chars = words / tokens | 200 words = chars / tokens | 256 tokens = chars / words
 prose |              167 / 188      |            1204 / 226     |            1363 / 228
config |               85 / 286      |            2360 / 678     |             893 / 76
  logs |               74 / 318      |            2728 / 867     |             806 / 60

Chinese text: 320 characters -> 1 whitespace word, 40 approximate tokens
```

> [!example] Read the `config` row. A 1,000-character chunk of configuration holds about 286 approximate tokens, already over a 256-token embedder's limit, while the same 1,000 characters of prose hold about 188. A 200-word chunk of logs holds about 867 tokens, nearly 3.4 times the limit. Only the token-sized window (256 tokens, last column group) lands on the limit for every kind of text; what varies is how many characters or words that is.

### 5. A real retriever, from scratch

TF-IDF turns a text into a vector with one coordinate per vocabulary term: how often the term occurs (dampened with `1 + log(count)`, "sublinear" tf), times how rare the term is (inverse document frequency, `ln((1 + n) / (1 + df)) + 1`, the smoothed form scikit-learn documents), scaled to length 1. Cosine similarity is then a dot product, exactly the brute-force search of [Module 03](../03-cosine-similarity-and-distance-metrics/README.md). The vocabulary and the idf weights are fitted once on the corpus's sentences, so the "model" stays the same whatever the chunk size, as a real embedding model would. `max_tokens` imitates an embedder's input limit by encoding only each chunk's first tokens.

```python
# ---- A real retriever, from scratch: TF-IDF vectors + cosine similarity, brute force in numpy ----
TOKEN_RE_W = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
STOP = set("a an the of to in on is are was be and or for by it its that this with as at from can may must".split())

def terms(text):
    return [w for w in TOKEN_RE_W.findall(text.lower()) if w not in STOP]

class TfidfModel:
    """The 'embedding model'. Its vocabulary and idf weights are fitted ONCE on the corpus sentences, so it does not
    change when the chunk size changes (just as a real embedding model does not). Vectors are sublinear-tf x idf, unit length."""
    def __init__(self, docs):
        sentences = [s for t in docs.values() for s in re.split(r"(?<=[.!?])\s+|\n+", t) if s.strip()]
        df = {}
        for s in sentences:
            for w in set(terms(s)):
                df[w] = df.get(w, 0) + 1
        self.vocab = {w: i for i, w in enumerate(sorted(df))}
        self.idf = np.array([np.log((1 + len(sentences)) / (1 + df[w])) + 1 for w in sorted(df)])

    def encode(self, texts, max_tokens=None):
        """-> (len(texts), vocabulary) array. If max_tokens is set, only the first max_tokens tokens of each text are
        seen: that is what an embedding model with an input limit does to a longer chunk."""
        X = np.zeros((len(texts), len(self.vocab)))
        for r, t in enumerate(texts):
            if max_tokens is not None:
                spans = token_spans(t)
                if len(spans) > max_tokens:
                    t = t[:spans[max_tokens - 1][1]]
            for w in terms(t):
                if w in self.vocab:
                    X[r, self.vocab[w]] += 1
        X = (X > 0) * (1 + np.log(np.maximum(X, 1))) * self.idf
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        return X / np.where(norms == 0, 1, norms)

def retrieve(model, chunks, queries, top, max_tokens=None):
    """-> for each query, the indices of the `top` most similar chunks (best first) and the score matrix."""
    C, Q = model.encode([c["text"] for c in chunks], max_tokens), model.encode(queries)
    scores = Q @ C.T                                    # cosine similarity, because every row has length 1
    return np.argsort(-scores, axis=1, kind="stable")[:, :top], scores

model = TfidfModel(docs)
chunks = make_chunks(docs, "tokens", 128)
q = next(x for x in questions if x["doc"] == "Orion" and "failed attempts" in x["q"])
order, scores = retrieve(model, chunks, [q["q"]], 3)
print("vocabulary:", len(model.vocab), "terms |", len(chunks), "chunks of 128 tokens\n")
print("Q:", q["q"])
for rank, j in enumerate(order[0], 1):
    c = chunks[j]
    print(f"  #{rank} score {scores[0, j]:.3f} from {c['doc']:<8} chars {c['start']:>5}-{c['end']:<5} contains the answer: {c['doc'] == q['doc'] and c['start'] <= q['start'] and q['end'] <= c['end']}")
```

Output:

```
vocabulary: 547 terms | 435 chunks of 128 tokens

Q: After how many failed attempts does Orion move a message to the dead-letter queue?
  #1 score 0.341 from Orion    chars  6817-7280  contains the answer: True
  #2 score 0.325 from Kestrel  chars  2752-3406  contains the answer: False
  #3 score 0.264 from Harbor   chars  6919-7411  contains the answer: False
```

### 6. Scoring, and how often a window cuts an answer

`covers` is the test used everywhere below. `hit_rate` hands the LLM either the top `k` chunks or as many whole chunks as fit a token budget, and `ceiling` is the best any retriever could do.

```python
# ---- Evaluation: do the chunks we hand to the LLM contain the answer, from the RIGHT document? ----
def covers(chunk, q, frac=1.0):
    """True if the chunk is from the right document and holds at least `frac` of the answer span.
    frac=1.0 (default) is the strict test: the WHOLE answer sentence(s) must sit inside the one chunk."""
    overlap = min(chunk["end"], q["end"]) - max(chunk["start"], q["start"])
    return chunk["doc"] == q["doc"] and overlap >= frac * (q["end"] - q["start"])

def prepare(how, size, max_input=None):
    """Chunk every document, embed the chunks (the embedder reads at most `max_input` tokens of each) and rank
    all chunks for every question. Returns what the later steps need."""
    chunks = make_chunks(docs, how, size)
    for c in chunks:
        c["n_tokens"] = n_tokens(c["text"])
    order, _ = retrieve(model, chunks, [q["q"] for q in questions], 60, max_input)
    return chunks, order

def hit_rate(chunks, order, k=None, budget=None, frac=1.0, only=None):
    """(share of questions answered by the chunks given to the LLM, mean tokens given to the LLM).
    k: take the top k chunks. budget: take whole chunks down the ranking until the next one would not fit.
    only: score just the questions of this kind ("fact" or "procedure")."""
    hits, given = [], []
    for q, row in zip(questions, order):
        if only and q["kind"] != only:
            continue
        kept, used = [], 0
        for j in row:
            if (k and len(kept) == k) or (budget and used + chunks[j]["n_tokens"] > budget):
                break
            kept.append(j)
            used += chunks[j]["n_tokens"]
        hits.append(any(covers(chunks[j], q, frac) for j in kept))
        given.append(used)
    return float(np.mean(hits)), float(np.mean(given))

def ceiling(chunks):
    """Share of questions whose whole answer sits inside SOME chunk. No retriever can beat this."""
    return float(np.mean([any(covers(c, q) for c in chunks) for q in questions]))

answer_len = np.array([n_tokens(docs[q["doc"]][q["start"]:q["end"]]) for q in questions])
is_steps = np.array([q["kind"] == "procedure" for q in questions])
print(f"answers: {answer_len[~is_steps].mean():.1f} approximate tokens on average for the one-sentence facts, "
      f"{answer_len[is_steps].mean():.1f} for the three-sentence procedure\n")
print(f"{'window':>7} {'answer cut (measured)':>22} {'predicted mean(min(1, L/W))':>28}")
for size in (16, 32, 64, 128, 256, 512):
    chunks, _ = prepare("tokens", size)
    print(f"{size:>7} {1 - ceiling(chunks):>22.3f} {np.mean(np.minimum(1, answer_len / size)):>28.3f}")
```

Output:

```
answers: 14.4 approximate tokens on average for the one-sentence facts, 43.0 for the three-sentence procedure

 window  answer cut (measured)  predicted mean(min(1, L/W))
     16                  0.819                        0.863
     32                  0.435                        0.477
     64                  0.224                        0.247
    128                  0.121                        0.123
    256                  0.065                        0.062
    512                  0.020                        0.031
```

The measured cut rate tracks `L / W` closely. It is not exact, because the formula treats the window start as random relative to the answer and answers differ in length.

### 7. The sweep at a fixed `k`

```python
# ---- The sweep: hand the LLM the top 3 chunks. Does the embedder read each chunk fully, or only its first 256 tokens? ----
MAX_INPUT = 256     # a round, deliberately small input limit; real limits differ per model (see Module 02)
SIZES = [16, 32, 64, 96, 128, 192, 256, 384, 512, 1024, 100_000]     # 100_000 = one chunk per whole document

print(f"{'size':>6} {'chunks':>7} {'ceiling':>8} | {'hit@3 whole':>11} {'hit@3 half':>10} {'LLM tokens':>11} | {'hit@3 whole, 256-token embedder':>32}")
for size in SIZES:
    chunks, order = prepare("tokens", size)
    chunks_l, order_l = prepare("tokens", size, MAX_INPUT)
    whole, given = hit_rate(chunks, order, k=3)
    half, _ = hit_rate(chunks, order, k=3, frac=0.5)
    whole_l, _ = hit_rate(chunks_l, order_l, k=3)
    label = "doc" if size == 100_000 else size
    print(f"{label:>6} {len(chunks):>7} {ceiling(chunks):>8.3f} | {whole:>11.3f} {half:>10.3f} {given:>11.0f} | {whole_l:>32.3f}")
```

Output:

```
  size  chunks  ceiling | hit@3 whole hit@3 half  LLM tokens |  hit@3 whole, 256-token embedder
    16    3343    0.181 |       0.077      0.304          47 |                            0.077
    32    1680    0.565 |       0.344      0.515          89 |                            0.344
    64     849    0.776 |       0.616      0.728         174 |                            0.616
    96     575    0.856 |       0.759      0.853         258 |                            0.759
   128     435    0.879 |       0.823      0.896         342 |                            0.823
   192     294    0.938 |       0.870      0.921         505 |                            0.870
   256     231    0.935 |       0.920      0.966         618 |                            0.920
   384     160    0.966 |       0.953      0.980         808 |                            0.774
   512     120    0.980 |       0.979      0.994        1161 |                            0.769
  1024      80    0.991 |       0.925      0.931        1455 |                            0.740
   doc      40    1.000 |       1.000      1.000        3921 |                            0.840
```

Read down the columns. `ceiling` and `hit@3` mostly climb with chunk size. The half-answer score is higher than the whole-answer score at every size except whole documents (both 1.000), most of all at small sizes, and it has the same shape. The `LLM tokens` column is the price. With a 256-token embedder, nothing changes up to 256 tokens and then the score drops: 0.920 at 256 tokens, 0.774 at 384, 0.769 at 512, against 0.953 and 0.979 for an embedder that reads everything. Whole documents recover to 0.840 only because every handbook's title, which names the service, is in its first 256 tokens.

### 8. The sweep at a fixed LLM budget

```python
# ---- The same sweep under a fixed LLM budget: hand over as many whole chunks as fit in B tokens ----
BUDGETS = [256, 512, 1024, 2048]
grid = {}
print(f"{'':>5} | {'256-token embedder, LLM budget in tokens':^35} | {'embedder reads all':>18}")
print(f"{'size':>5} | " + " ".join(f"{b:>8}" for b in BUDGETS) + f" | {'budget 512':>18}")
for size in [32, 64, 96, 128, 192, 256, 384, 512, 768, 1024]:
    chunks_l, order_l = prepare("tokens", size, MAX_INPUT)
    chunks_a, order_a = prepare("tokens", size)
    for b in BUDGETS:
        grid[size, b] = hit_rate(chunks_l, order_l, budget=b)[0]
    all_512 = hit_rate(chunks_a, order_a, budget=512)[0]
    print(f"{size:>5} | " + " ".join(f"{grid[size, b]:>8.3f}" for b in BUDGETS) + f" | {all_512:>18.3f}")
print("\nbest chunk size per budget:", {b: max((s for s, bb in grid if bb == b), key=lambda s: grid[s, b]) for b in BUDGETS})

# One-sentence answers versus the three-sentence answer ("how do I rotate a key?"), at B = 512
print(f"\n{'size':>5} {'one-sentence':>13} {'three-sentence':>15}")
for size in (32, 64, 128, 256, 512):
    chunks_l, order_l = prepare("tokens", size, MAX_INPUT)
    fact, steps = (hit_rate(chunks_l, order_l, budget=512, only=kind)[0] for kind in ("fact", "procedure"))
    print(f"{size:>5} {fact:>13.3f} {steps:>15.3f}")
```

Output:

```
      | 256-token embedder, LLM budget in tokens | embedder reads all
 size |      256      512     1024     2048 |         budget 512
   32 |    0.378    0.417    0.492    0.530 |              0.417
   64 |    0.629    0.661    0.705    0.750 |              0.661
   96 |    0.729    0.800    0.811    0.836 |              0.800
  128 |    0.807    0.829    0.863    0.874 |              0.829
  192 |    0.760    0.891    0.925    0.931 |              0.891
  256 |    0.547    0.906    0.930    0.934 |              0.906
  384 |    0.101    0.660    0.765    0.826 |              0.802
  512 |    0.040    0.634    0.734    0.787 |              0.885
  768 |    0.000    0.051    0.545    0.719 |              0.084
 1024 |    0.041    0.206    0.640    0.735 |              0.231

best chunk size per budget: {256: 128, 512: 256, 1024: 256, 2048: 256}

 size  one-sentence  three-sentence
   32         0.439           0.000
   64         0.676           0.375
  128         0.837           0.675
  256         0.909           0.850
  512         0.634           0.625
```

With the 256-token embedder the best size is 256 tokens for budgets of 512 tokens and up, and the curve falls on both sides. The last column removes the embedder's limit (budget 512). From 384 tokens up, one chunk (rarely two) fits the budget, and the bigger one wins (0.802 at 384, 0.885 at 512), but both lose to the 192 and 256-token sizes that fit two or three chunks (0.891 and 0.906). Without the input limit the peak is therefore a broad plateau rather than a sharp point, and 768 tokens still fails because one chunk of that size does not fit into 512 tokens at all. The second table splits the questions: the three-sentence procedure needs larger chunks than one-sentence facts, and gets no hits at all at 32 tokens, where a 43-token answer cannot fit in a chunk.

### 9. Why: context loss and dilution

```python
# ---- Why do small chunks fail, and why do big ones cost more than they give? ----
# (1) Context loss: the chunk holds the answer sentence, but does it also say WHICH service the sentence is about?
print(f"{'size':>5} {'answer intact':>14} | {'chunk names service':>20} {'hit@3':>6} | {'chunk does not':>15} {'hit@3':>6}")
for size in (16, 32, 64, 128, 256):
    chunks, order = prepare("tokens", size)
    named, unnamed = [], []
    for q, row in zip(questions, order):
        owner = [c for c in chunks if covers(c, q)]
        if owner:
            (named if q["doc"] in owner[0]["text"] else unnamed).append(any(covers(chunks[j], q) for j in row[:3]))
    print(f"{size:>5} {len(named) + len(unnamed):>14} | {len(named):>20} {np.mean(named):>6.3f} | {len(unnamed):>15} {np.mean(unnamed):>6.3f}")

# (2) Dilution: how well does the question match the answer sentence when more and more other text surrounds it?
tokens_of = {name: list(TOKEN_RE.finditer(text)) for name, text in docs.items()}

def window_around(q, width):
    """About `width` tokens of the document, centred on the answer sentence(s) (at least the answer itself)."""
    toks, text = tokens_of[q["doc"]], docs[q["doc"]]
    a = next(i for i, m in enumerate(toks) if m.start() >= q["start"])
    b = max(i for i, m in enumerate(toks) if m.end() <= q["end"])
    extra = max(0, width - (b - a + 1))
    lo, hi = max(0, a - extra // 2), min(len(toks) - 1, b + extra // 2)
    return text[toks[lo].start():toks[hi].end()]

Q = model.encode([q["q"] for q in questions])
print("\nmean cosine between a question and the text around its answer:")
for width in (0, 32, 64, 128, 256, 512, 1024):
    W = model.encode([window_around(q, width) for q in questions])
    print(f"  {'the answer sentence alone' if width == 0 else f'about {width} tokens around it':>26}: {np.mean(np.sum(Q * W, axis=1)):.3f}")
```

Output:

```
 size  answer intact |  chunk names service  hit@3 |  chunk does not  hit@3
   16            145 |                   44  1.000 |             101  0.178
   32            452 |                  218  0.982 |             234  0.261
   64            621 |                  465  0.951 |             156  0.327
  128            703 |                  686  0.946 |              17  0.529
  256            748 |                  737  0.986 |              11  0.818

mean cosine between a question and the text around its answer:
   the answer sentence alone: 0.526
   about 32 tokens around it: 0.424
   about 64 tokens around it: 0.362
  about 128 tokens around it: 0.319
  about 256 tokens around it: 0.275
  about 512 tokens around it: 0.235
  about 1024 tokens around it: 0.203
```

In the first table, "answer intact" counts the questions whose answer sits whole in a chunk (the others are already lost). When that chunk also names the service the hit rate (top 3) is 0.946 or higher at every size; when it does not, it is between 0.178 and 0.529 for 16 to 128 tokens. Small chunks lose the subject far more often (101 of 145 at 16 tokens, 17 of 703 at 128). Correlation, not proof: chunks that name the service also tend to start a section. The second table is the dilution measure used above.

### 10. Is this just one lucky corpus?

Repeat the budgeted sweep on eight corpora with different seeds, which changes the facts, the section order and the boilerplate. The block ends by restoring the seed-7 corpus.

```python
# ---- Is this just one lucky corpus? Repeat the budgeted sweep on 8 differently seeded corpora ----
SEEDS = range(8)
sweep_sizes = [32, 64, 128, 192, 256, 384, 512]
results = {size: [] for size in sweep_sizes}
for seed in SEEDS:
    docs, questions = make_corpus(seed)          # a new corpus, new facts, new layout
    model = TfidfModel(docs)                     # and a model fitted on it
    for size in sweep_sizes:
        chunks_l, order_l = prepare("tokens", size, MAX_INPUT)
        results[size].append(hit_rate(chunks_l, order_l, budget=512)[0])
docs, questions = make_corpus(7)                 # back to the corpus used everywhere else
model = TfidfModel(docs)

print("hit rate with a 512-token LLM budget and a 256-token embedder, 8 corpora:")
print(f"{'size':>5} {'mean':>7} {'std':>6} {'min':>6} {'max':>6}")
for size in sweep_sizes:
    r = np.array(results[size])
    print(f"{size:>5} {r.mean():>7.3f} {r.std():>6.3f} {r.min():>6.3f} {r.max():>6.3f}")
best = [sweep_sizes[int(np.argmax([results[s][i] for s in sweep_sizes]))] for i in range(len(SEEDS))]
print("best size on each corpus:", best)
```

Output:

```
hit rate with a 512-token LLM budget and a 256-token embedder, 8 corpora:
 size    mean    std    min    max
   32   0.404  0.011  0.384  0.420
   64   0.642  0.019  0.613  0.672
  128   0.840  0.012  0.819  0.863
  192   0.884  0.012  0.868  0.902
  256   0.886  0.023  0.834  0.910
  384   0.660  0.014  0.627  0.676
  512   0.602  0.015  0.579  0.634
best size on each corpus: [256, 192, 256, 256, 192, 192, 192, 256]
```

The same inverted-U shape appears on all eight corpora. The standard deviation across corpora is small (0.011 to 0.023), much smaller than the gaps between sizes. What does not transfer is the location of the peak, which belongs to this corpus.

### Using a real tokenizer (not executed)

Only `token_spans` has to change. A Hugging Face "fast" tokenizer can return the character offsets of its tokens, which keeps every other block working unchanged. This snippet is **not executed in this module's verification** (it needs `transformers` and a model download), so check the library's current documentation before relying on it.

```python
# NOT EXECUTED in this module's verification (needs `pip install transformers` and a model download).
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")   # use YOUR embedding model's tokenizer

def token_spans(text):
    enc = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    return [tuple(span) for span in enc["offset_mapping"]]
```

Define it after block 2 (and before the sweeps), and `chunk_tokens`, `n_tokens` and the embedder's input limit all use real tokens. It may print a warning that the text is longer than the model's maximum length; that is expected here, because chunking is exactly what you are about to do about it.

## Visual diagram

```
  handbook text
       │
       ▼
  ┌──────────────┐   W too small ► answers cut in half; the subject ("Orion") is left behind
  │ 1. CHUNKER   │
  └──────┬───────┘
         ▼  chunks of W units
  ┌──────────────┐   W above the model's input limit ► the tail of every chunk is never embedded
  │ 2. EMBEDDER  │   W large ► one vector summarises more (cosine to the answer: 0.53 alone, 0.20 in 1,024 tokens)
  └──────┬───────┘
         ▼  one vector per chunk
  ┌──────────────┐
  │ 3. SEARCH    │   cosine similarity, brute force (Module 03)
  └──────┬───────┘
         ▼  chunks, best first
  ┌──────────────┐   W large ► few chunks fit; every token is billed; the middle of a long context is used worst
  │ 4. PACK      │
  └──────┬───────┘
         ▼
        LLM reads only what fits in the budget


  A fixed window cuts an answer with probability about L / W          (block 6)

   windows of W = 64 tokens, laid end to end, blind to the content
   ┌─────────────────────────────────┬─────────────────────────────────┬──────────────────────┐
   │ chunk 1                         │ chunk 2                         │ chunk 3 ...          │
   └─────────────────────────────────┴─────────────────────────────────┴──────────────────────┘
                                                                       ▲
   ...Orion accepts at most 64 KB per message, and larger payloads are │ rejected with an error. ...
      (an answer of L = 16 tokens)                                     the boundary fell here (block 3)

   answers cut, measured vs L / W:  W=16: 82% vs 86%    W=64: 22% vs 25%    W=256: 6.5% vs 6.2%


  Hit rate when the LLM gets 512 tokens, 256-token embedder (block 8, one bar = 0.025)

     32 tokens │█████████████████                        0.417
     64 tokens │██████████████████████████               0.661
     96 tokens │████████████████████████████████         0.800
    128 tokens │█████████████████████████████████        0.829
    192 tokens │████████████████████████████████████     0.891
    256 tokens │████████████████████████████████████     0.906   ◄ embedder limit
    384 tokens │██████████████████████████               0.660
    512 tokens │█████████████████████████                0.634
    768 tokens │██                                       0.051
   1024 tokens │████████                                 0.206
```

## Practice

### 1. Do characters, words and tokens differ in accuracy?

Predict first. Chunk the corpus with each unit at sizes chosen to be about 128 and about 256 approximate tokens (700 characters, 118 words, 128 tokens; then 1,400 characters, 236 words, 256 tokens). Report hit@3, the hit rate at a 512-token budget and the share of chunks longer than the 256-token embedder limit. Does the unit change accuracy?

<details><summary>Answer</summary>

```python
print(f"{'unit':>7} {'size':>5} {'avg tokens':>11} {'hit@3':>7} {'hit, B=512':>11} {'chunks > 256 tokens':>20}")
for how, size in (("chars", 700), ("words", 118), ("tokens", 128), ("chars", 1400), ("words", 236), ("tokens", 256)):
    chunks, order = prepare(how, size, MAX_INPUT)
    toks = [c["n_tokens"] for c in chunks]
    print(f"{how:>7} {size:>5} {np.mean(toks):>11.0f} {hit_rate(chunks, order, k=3)[0]:>7.3f} {hit_rate(chunks, order, budget=512)[0]:>11.3f} {np.mean(np.array(toks) > 256):>20.1%}")
```

Output:

```
   unit  size  avg tokens   hit@3  hit, B=512  chunks > 256 tokens
  chars   700         127   0.843       0.846                 0.0%
  words   118         128   0.848       0.850                 0.0%
 tokens   128         122   0.823       0.829                 0.0%
  chars  1400         244   0.909       0.838                77.5%
  words   236         247   0.891       0.860                82.3%
 tokens   256         230   0.920       0.906                 0.0%
```

At about 128 tokens the three units are within 0.025 of each other on hit@3 (0.823 to 0.848): on clean prose the unit does not change accuracy. At the 256-token level the picture changes. Windows sized in characters or words only *aim* at 256 tokens; 78% and 82% of those chunks are over the limit, the embedder drops their tails, and the hit rate at a 512-token budget is 0.838 and 0.860 against 0.906 for chunks sized in tokens. The unit buys you a guarantee about the limit, not better accuracy; the error is larger still on code, configuration or logs (block 4).

</details>

### 2. Can a larger `k` rescue small chunks?

Use 16, 32 and 128-token chunks. Print the ceiling and hit@1, 3, 10 and 30. What happens to hit@30 compared with the ceiling?

<details><summary>Answer</summary>

```python
print(f"{'size':>5} {'ceiling':>8} | " + " ".join(f"{'hit@' + str(k):>7}" for k in (1, 3, 10, 30)))
for size in (16, 32, 128):
    chunks, order = prepare("tokens", size)
    print(f"{size:>5} {ceiling(chunks):>8.3f} | " + " ".join(f"{hit_rate(chunks, order, k=k)[0]:>7.3f}" for k in (1, 3, 10, 30)))
```

Output:

```
 size  ceiling |   hit@1   hit@3  hit@10  hit@30
   16    0.181 |   0.075   0.077   0.095   0.129
   32    0.565 |   0.271   0.344   0.385   0.490
  128    0.879 |   0.565   0.823   0.864   0.879
```

`k` helps only up to the ceiling. At 16 tokens the ceiling is 0.181 and even 30 chunks reach only 0.129; at 32 tokens 30 chunks reach 0.490 of a possible 0.565; only at 128 tokens does hit@30 meet the ceiling (0.879). Going from `k = 1` to `k = 3` is the big step for every size (0.565 to 0.823 at 128 tokens), because the right chunk is often ranked second or third. Beyond that, a larger `k` buys little and costs tokens, and no `k` removes a cut.

</details>

### 3. Move the embedder's input limit

Repeat the search for the best chunk size with an LLM budget of 1,024 tokens and embedder limits of 128, 256 and 512 tokens. Predict where the best size lands, then run it.

<details><summary>Answer</summary>

```python
for limit in (128, 256, 512):
    row = {size: hit_rate(*prepare("tokens", size, limit), budget=1024)[0] for size in (64, 128, 192, 256, 384, 512)}
    best = max(row, key=row.get)
    print(f"embedder reads {limit:>3} tokens: best size {best:>3} ({row[best]:.3f}) | " + " ".join(f"{s}:{v:.3f}" for s, v in row.items()))
```

Output:

```
embedder reads 128 tokens: best size 128 (0.863) | 64:0.705 128:0.863 192:0.708 256:0.584 384:0.481 512:0.481
embedder reads 256 tokens: best size 256 (0.930) | 64:0.705 128:0.863 192:0.925 256:0.930 384:0.765 512:0.734
embedder reads 512 tokens: best size 512 (0.969) | 64:0.705 128:0.863 192:0.925 256:0.930 384:0.954 512:0.969
```

The best size equals the embedder's limit each time (128, 256, 512), and the score above the limit collapses: for a 128-token embedder, 256-token chunks score 0.584, against 0.930 for a 256-token embedder. Here the answers are short and the budget is generous, so the best size sits right at the limit; with a small budget (block 8, `B = 256`) it sat below it (128 against 256). The limit is a hard ceiling on chunk size; the answers and the budget decide how far below it to stay. In practice leave a margin, because your token count will not exactly match the embedder's.

</details>

### Checkpoint quiz

1. Name the three limits that make you chunk documents, in terms of the embedder, the index and the LLM.
2. A teammate sizes chunks at 1,000 characters "because the model takes 256 tokens". Give two reasons that is unsafe.
3. Why does the hit rate at fixed `k = 3` rise as chunks get bigger, and why is that misleading?
4. An answer is 20 tokens long and the window is 200 tokens. Roughly how often is it cut? What if the answer is 40 tokens and the window 100?
5. Why can raising `k` not rescue an answer that is cut?
6. How does the best chunk size change when (a) the LLM budget grows, (b) the embedder's input limit is lowered?

<details><summary>Answers</summary>

1. The embedder reads only its first tokens (the rest is truncated); one vector represents one chunk, so the chunk is the unit retrieval can return; the LLM has a finite, billed context that it uses unevenly.
2. Tokens per character vary with content (logs and configuration give far more tokens per 1,000 characters than prose, block 4), and your token count may differ from the model's. In both cases chunks exceed the limit and the embedder silently drops their ends. Character windows also split words.
3. A bigger chunk contains more text, so it contains the answer more often, and `k` chunks cover `k` times more of the corpus. It is misleading because the LLM is handed proportionally more tokens (47 tokens at 16-token chunks, 3,921 for whole documents in block 7). Compare at a fixed token budget, or report the tokens beside the hit rate.
4. About `L / W = 20 / 200 = 10%`; and about `40 / 100 = 40%`.
5. The ceiling: if no chunk holds the whole answer, no ranking of the existing chunks can produce it (Practice 2: hit@30 stays below the ceiling at 16 and 32 tokens).
6. (a) Bigger budget: the best size moves up (block 8: 128 tokens at `B = 256`, 256 tokens at 512 and above, with a 256-token embedder); (b) lower limit: the best size falls with it (Practice 3: 128, 256 and 512 for limits of 128, 256 and 512).

</details>

> [!check]
> - I can explain the three limits that force chunking.
> - I can chunk by characters, words and tokens and say what each unit guarantees and costs.
> - I can predict how often a fixed window cuts an answer, and compute a recall ceiling.
> - I can tell why hit rate at fixed `k` flatters large chunks and how to compare sizes fairly.
> - I can explain the two ways small chunks fail and the three ways large chunks fail.
> - I can say what a toy corpus with TF-IDF can and cannot tell me about a real embedding model.

## Project

Run the experiment on documents you actually have, and find out which of this module's conclusions survive. Pick 10 to 20 real documents (for example the READMEs of a repository you know, or a set of your own notes), write about 40 questions each with a short answer you can point at, and store each answer's character span. Reuse the chunkers and the scoring, but swap in a model you could really deploy: your own TF-IDF, BM25 if you know it, or a local embedding model if one is available, counting tokens with that model's own tokenizer. Sweep chunk size at several LLM budgets, with and without the model's input limit, and plot the curves.

Report: the recall ceiling at each size; the best size per budget; how the curves for short and multi-sentence answers differ; and which of this module's findings did not hold on your documents (for instance, documents with tables, code or no repeated subject name). End with the size you would ship, the assumptions it depends on, and what you would re-measure if the embedding model, the LLM or the documents changed. No code is given.

## Interview questions

> [!interview] Why do RAG pipelines split documents into chunks instead of embedding each document whole?

<details><summary>What a strong answer covers</summary>

- The embedding model has an input limit and truncates the rest, so long documents would be partly invisible to search.
- One vector per document means the retrievable unit is the whole document: poor granularity, and a vector that must summarise many topics.
- The LLM's context is limited, billed per token and used unevenly (the middle of a long context is used worst), so retrieval should return small, relevant pieces.
- Notes the cost: cutting loses context and can split answers, and changing chunking later means re-embedding everything.

</details>

> [!interview] Users report that the system retrieves the right document but the generated answer is wrong or incomplete. How do you find out whether chunking is the cause?

<details><summary>What a strong answer covers</summary>

- Builds or reuses a small labelled set of questions with the location of the answer in the source, then checks whether the whole answer sits inside a retrieved chunk. This separates "retrieved the right document" from "the answer was in the context".
- Computes the recall ceiling for the current chunk size, and inspects the chunk boundaries around missed answers (cut sentences, steps split across chunks, chunks that omit the subject).
- Checks that no chunk exceeds the embedder's limit, counting with its own tokenizer.
- Reports tokens handed to the LLM next to the hit rate, and varies size at a fixed budget rather than a fixed `k`.
- Names the follow-ups: boundary-aware splitting, overlap, and attaching titles or other context to each chunk.

</details>

> [!interview] How would you choose a chunk size for a new corpus?

<details><summary>What a strong answer covers</summary>

- Starts from the hard constraints: the embedder's input limit (with a margin), the LLM's budget and how many chunks you want to send.
- Builds an evaluation set from the real documents and real (or realistic) questions, and sweeps size, scoring whether the full answer is in the context and the tokens it costs, with error bars from several samples.
- Looks at answer length: multi-sentence answers need larger or structure-aware chunks, so a single fixed size may not fit all document types.
- Treats library defaults and tutorial numbers as starting points to be measured, and expects to re-run the sweep if the model, the LLM or the corpus changes.

</details>

## Common mistakes & troubleshooting

- **Retrieval is fine on short chunks and falls apart on long ones.** Check the embedder's input limit first. Count every chunk's tokens with the model's own tokenizer and assert that none exceeds the limit (block 7: 0.920 at 256 tokens, 0.774 at 384 under a 256-token limit).
- **The same character size worked for prose but not for configuration, logs, code or another language.** Characters and words do not map to a fixed number of tokens (block 4), and whitespace splitting treated 320 Chinese characters as a single word. Size chunks in tokens, counted by the model's own tokenizer.
- **The search finds the right place, but the answer text is cut mid-sentence or a procedure is missing its last step.** Compute the recall ceiling and print the boundaries around missed answers (block 3). The fix is not a better ranking.
- **A chunk contains the answer but never matches the question.** It probably does not say what it is about (block 9: 0.261 against 0.982 at 32 tokens). That is the case for attaching titles and other context, which [Module 08](../08-chunk-overlap-and-metadata/README.md) covers.
- **Raising `k` improved the offline score but the bill and the latency went up.** Recall at fixed `k` flatters big chunks and big `k` (block 7). Compare at a fixed token budget.
- **Changing the chunk size "did nothing", or search results are strange afterwards.** Old vectors are still in the index. Every chunk has a new text and therefore a new cache key ([Module 05](../05-generating-embeddings-at-scale/README.md)); rebuild into a fresh index and never mix chunk sizes in one index. Scores from long chunks are also systematically lower than scores from short ones (block 9), so a single similarity threshold does not transfer between sizes.
- **Results from this module's numbers do not match your system.** They should not: they come from a toy corpus and a TF-IDF stand-in. Reuse the method, not the numbers.

## Further reading & sources

- [Computing Embeddings (Sentence Transformers documentation)](https://www.sbert.net/examples/sentence_transformer/applications/computing-embeddings/README.html) - official documentation stating that each model has a `max_seq_length` and that longer texts are truncated to it; the source for the input-limit argument and the 256 used in the sweeps.
- [Dense X Retrieval: What Retrieval Granularity Should We Use? (Chen et al., 2023)](https://arxiv.org/abs/2312.06648) - paper on how the choice of retrieval unit (passage, sentence, proposition) affects retrieval and downstream QA; the primary source for "the indexed unit sets the granularity of every answer".
- [Lost in the Middle: How Language Models Use Long Contexts (Liu et al., 2023)](https://arxiv.org/abs/2307.03172) - paper reporting that models use information in the middle of long inputs worse than at the start or end; cited for why handing the LLM large chunks is not free.
- [Evaluating Chunking Strategies for Retrieval (Smith and Troynikov, Chroma Technical Report, 2024)](https://www.trychroma.com/research/evaluating-chunking) - a vendor-authored empirical comparison of fixed-size and other splitters using token-level recall, precision and IoU on five corpora; a real-embedding-model counterpart to this module's toy sweep (different metric, so compare conclusions, not numbers).
- [Text splitter integrations (LangChain documentation)](https://docs.langchain.com/oss/python/integrations/splitters) - official overview of length-based splitting by characters or tokens and the structure-based splitters of Module 07; cited for how common libraries expose fixed-size chunking.
- [Node Parser Modules (LlamaIndex documentation)](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/) - official docs for `TokenTextSplitter` and `SentenceSplitter`; cited for the token-count splitter and as a pointer to boundary-aware splitting.
- [Feature extraction (scikit-learn documentation)](https://scikit-learn.org/stable/modules/feature_extraction.html) - documents the smoothed idf formula `ln((1 + n) / (1 + df)) + 1` used by this module's retriever.
- [TfidfVectorizer (scikit-learn documentation)](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html) - documents `sublinear_tf` ("replace tf with 1 + log(tf)"), the term-frequency damping used by this module's retriever.

## Next

[Module 07: Chunking: Semantic and Structural](../07-chunking-semantic-and-structural/README.md)
