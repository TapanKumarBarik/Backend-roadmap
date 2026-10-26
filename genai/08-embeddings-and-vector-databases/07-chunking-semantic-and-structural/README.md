# Module 07: Chunking: Semantic and Structural

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. [Module 06](../06-chunking-fixed-size-strategies/README.md) cut text into pieces of a fixed size: simple and predictable, but a ruler does not know where a sentence, a section or a function ends. This module cuts along the document's own seams instead: sentence ends, paragraph breaks, headings, function definitions, and, when a document shows no seams at all, the places where its topic changes. It leans on [Module 03](../03-cosine-similarity-and-distance-metrics/README.md) (cosine similarity, used to find topic changes), [Module 05](../05-generating-embeddings-at-scale/README.md) (every embedded piece costs a call and has an input limit) and Modules [00](../00-what-an-embedding-is/README.md) to [02](../02-embedding-models-compared/README.md) (what an embedder is). Fixed windows and chunk-size trade-offs are Module 06's job; overlap and metadata are [Module 08](../08-chunk-overlap-and-metadata/README.md)'s. Neither is repeated here.

After this module you can:

- split text into sentences with a lossless splitter and pack the sentences into size-limited chunks;
- write a recursive splitter with a separator hierarchy (paragraph, line, sentence, word) and test its invariants;
- split Markdown at headings while keeping each chunk's heading path, without being fooled by `#` inside code fences, and describe the same idea for HTML and PDF-derived text;
- split Python source at function and class boundaries with the `ast` module and check the result on real standard-library code;
- build a small embedder from scratch (TF-IDF plus truncated SVD), use it for semantic chunking, and measure boundary precision and recall on documents whose true boundaries you know;
- implement parent-child (small-to-big) retrieval and say what it costs;
- decide, with evidence instead of fashion, which splitter a given corpus deserves.

Why it matters: a chunk gets exactly one vector. A chunk that mixes two topics gets a vector that is a compromise between them, and a chunk cut mid-sentence or mid-function arrives without its subject or its body. Track 08's own README says most RAG failures are embedding or chunking failures; this module is about the chunking half, and about not paying for cleverness that a paragraph break would have given you for free.

## Concept

> [!key] Cut where the document already has a seam (sentence, paragraph, heading, function) and keep the seam's label (heading path, class name) with the chunk. Finding a seam by comparing the meaning of neighbouring sentences ("semantic chunking") is an expensive last resort for text with no visible structure, worth adopting only if you can measure that it beats the cheap splitter on your own data.

## Explanation

### Why a fixed size is not enough

A fixed-size splitter is blind. It will happily cut a sentence in half, put the end of one section and the start of the next in one chunk, or slice a function through its body. Block 2 shows the plainest symptom: on a 3,765-character document cut every 500 characters, only 3 of 8 chunks end at the end of a sentence; a recursive splitter with the same 500-character limit ends 10 of 10 chunks on a sentence end.

> [!model] A book already has seams: chapters, sections, paragraphs, sentences. Cutting every 100 pages is easy and fair, but it will cut through the middle of a paragraph. Cutting at the seams gives pieces of uneven length that each make sense on their own. This module is about finding the seams, in the cheapest way that works.

### Sentence-boundary splitting

A sentence is the smallest unit that carries a complete thought, so it is a natural atom: split the text into sentences, then pack whole sentences into a chunk until a size budget is reached. The hard part is the splitting. A full stop is not always a sentence end: `Dr. Smith`, `3.14`, `e.g.`, `U.S.`, `Fig. 3`, `No. 5`. A rule-based splitter looks at what follows the punctuation (whitespace then a capital letter or digit) and at a list of known abbreviations; a trained model can learn these patterns from data. Libraries such as NLTK and spaCy ship dedicated sentence segmenters that handle many of these cases; neither is installed where this module was verified, so I did not run them.

Block 1 compares a naive regex with a careful rule-based splitter on a six-sentence text full of traps. The naive regex returns 10 pieces; the careful one returns 5, because it merged `No. It was a unit error.` (the word "no" is on its abbreviation list, as in `No. 5`). Every rule has a counterexample. For chunking this is tolerable: a wrong merge keeps two short sentences together, while a wrong split can leave a fragment like `Dr.` as a chunk of its own, so err toward merging.

Two design choices carry through the rest of the module. First, the splitter is **lossless**: every piece keeps its trailing whitespace, so concatenating the pieces gives back the original text exactly. That keeps character offsets valid, which you need later for citations. Second, **packing** is greedy: add whole sentences until the next one would not fit. A single sentence longer than the budget stays whole, which is why the next section exists.

> [!pitfall] Sentence rules are language-specific. LlamaIndex's semantic splitter documentation warns that its sentence regex "primarily works for English sentences". Test your splitter on a sample of the real corpus before trusting it.

### Recursive splitting: a separator hierarchy

The recursive splitter tries the coarsest separator first. It cuts at paragraph breaks; pieces that fit are kept and neighbouring small pieces are merged back together up to the limit; a piece that is still too big is cut again with the next finer separator (line, then sentence, then word); only if nothing is left does it cut blindly every `max_len` characters. The effect is that cuts land on the biggest seam that allows the limit to be respected.

LangChain's documentation recommends starting with its `RecursiveCharacterTextSplitter` for most use cases ([Text splitter integrations](https://docs.langchain.com/oss/python/integrations/splitters)) and documents its default separator list as paragraph, line, space, empty string ([Splitting recursively](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter)). The version here adds a sentence level between line and word, which is my choice, not LangChain's default.

Block 2 builds it and checks three invariants worth testing in any splitter you write: the chunks concatenate back to the original text, none is longer than the limit, and (for this document) cuts fall on sentence ends.

Two consequences matter more than the algorithm:

- **The limit, not the topic, decides what gets merged.** Merging neighbours back up to `max_len` avoids a flood of tiny chunks, but it also glues the end of one section to the start of the next whenever both fit. Block 8 measures it: with the limit near the paragraph size every chunk holds one topic; with a limit nearly twice as large, most chunks mix topics.
- **It degrades gracefully, not magically.** Text with no separators at all (a minified JSON line, a long log record, a URL) falls through every level and gets hard-cut. Exercise 1 shows it and a one-line fix.

Sizes here are measured in characters so the code runs anywhere. Embedding models count tokens, and Module 05 explained why the model's own tokenizer must be the ruler; pass a token-counting length function in real use. Overlap between neighbouring chunks is deliberately not covered ([Module 08](../08-chunk-overlap-and-metadata/README.md)).

### Structure-aware splitting: Markdown, HTML and PDF-derived text

When authors have marked up their sections, use the marks. For Markdown that means splitting at headings and keeping the **heading path**: the list of ancestor titles, for example `Acme Queue > Worker daemon > Timeouts`. The path matters twice over. A chunk that says only `The default is 5 seconds.` is meaningless alone, and two different sections can share a title (both `Client library` and `Worker daemon` have a `Timeouts` heading), so the title alone does not identify the chunk but the path does.

Where the path lives is a design decision. If you only store it as metadata, the vector never sees it; if you prepend it to the text that gets embedded, the vector does. LangChain's `MarkdownHeaderTextSplitter` keeps header information in each chunk's metadata and, by default, strips the header lines from the chunk text (`strip_headers=False` keeps them) ([Split markdown](https://docs.langchain.com/oss/python/integrations/splitters/markdown_header_metadata_splitter)). Block 4 embeds the same four chunks both ways and asks which timeout the worker daemon has: without the path two chunks tie at 0.408; with it the right chunk scores 0.799 and the next 0.432. This is one toy query with a plain TF-IDF embedder; it shows the mechanism, not how large the benefit is on your data. How metadata is stored and used for filtering is [Module 08](../08-chunk-overlap-and-metadata/README.md) and [Module 16](../16-metadata-filtering-and-hybrid-queries/README.md).

> [!pitfall] A `#` at the start of a line is a heading only outside code. In CommonMark an ATX heading is 1 to 6 `#` characters followed by a space or tab (or the end of the line), indented at most three spaces, and the content of a fenced code block is literal text; an unclosed fence runs to the end of the document ([CommonMark spec](https://spec.commonmark.org/0.31.2/)). A splitter that matches `^#` on every line turns each shell comment inside a code block into a bogus heading and corrupts the heading path of everything after it. Block 4 tracks fences. It does not handle setext headings (underlined with `===`), and cutting an over-long section can still split a code block, which a production splitter should avoid.

**HTML** works the same way with different marks: `h1` to `h6` play the part of `#`, and `p`, `li`, `pre` and `table` are the blocks between them. LlamaIndex's `HTMLNodeParser` handles a default set of tags (`p`, `h1` to `h6`, `li`, `b`, `i`, `u`, `section`) per its documentation ([Node Parser Modules](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/)). The practical work is removing boilerplate (navigation, footers, cookie banners) before chunking, or it ends up in chunks and in your index.

**PDF-derived text** is the hard case. A PDF stores positioned glyphs, and typically no headings or paragraphs; the extraction step returns lines in some reading order, often with page headers and footers repeated, words hyphenated across lines, columns interleaved and tables flattened. Structure has to be inferred (font size, spacing) or recovered by a layout-aware parser, which is parsing, not chunking: see [Track 09, Module 03](../../09-retrieval-augmented-generation/03-document-loaders-and-parsing/README.md) and [Module 04](../../09-retrieval-augmented-generation/04-pdfs-tables-and-complex-documents/README.md). After cleaning, use whatever seams survive (blank lines, headings you could recover) and fall back to the recursive splitter. If extraction produced one flat run of text, you are in semantic-chunking territory.

In every case, structure-based chunks come in all sizes: a one-line section, a ten-page section. Always add a size guard (the recursive splitter inside oversized sections, as Block 4 does) because the embedding model's input limit (Module 05) does not care how tidy your sections are.

### Code-aware splitting with `ast`

Code's seams are syntactic: functions and classes. A function cut in half becomes two fragments that neither compile nor mean anything. Python ships a parser, so use it: `ast.parse(source)` returns a tree in which every statement knows the line it starts and ends on (`lineno`, `end_lineno`; the [ast documentation](https://docs.python.org/3/library/ast.html) notes that end positions are optional in the grammar), and you slice the source by those lines.

The details that decide whether it works (all in Block 5):

- **Decorators.** For a decorated function, `lineno` is the `def` line, not the decorator's. The `ast` page documents `decorator_list` but does not spell out this point; Block 5 shows it on Python 3.13 (`lineno` 10, decorator on line 9). Take the minimum over the decorators, or the decorator is stranded at the end of the previous chunk (Exercise 2 counts 8 such cases in the standard library's `enum.py`).
- **Comments above a definition** are not in the tree. Attach the comment lines directly above to the definition below.
- **Module-level statements** (imports, constants, an `if __name__` block) are not definitions; the runs between definitions become their own chunks, so nothing is dropped and the chunks tile the file exactly.
- **Size.** A class that is too big is cut into methods, each tagged with `class Name` as context; a function that is too big falls back to its lines; source that does not parse (`SyntaxError`) also falls back to lines.
- **Counting lines.** Cut the text on `\n` only, as the parser counts lines. `str.splitlines()` also splits on form feeds and other characters, and Block 5 shows it finding 5 lines where the parser sees 4.

The alternative is separator-based code splitting. LangChain's code splitter is the recursive splitter with a per-language separator list; for Python its documentation shows `['\nclass ', '\ndef ', '\n\tdef ', '\n\n', '\n', ' ', '']`, and it supports more than twenty languages ([Splitting code](https://docs.langchain.com/oss/python/integrations/splitters/code_splitter)). That needs no parser and never fails on broken code, but it matches text, not syntax: a line starting with the word `def` inside a string looks identical to a real definition, and a decorator sits on the line above the `def`. Block 5 applies a separator-style first level to a small file and cuts inside a string literal and between a decorator and its function; the `ast` version does neither. For other languages you need their parser (a multi-language parser library such as tree-sitter is the usual route; not run here) or the separator fallback.

### Semantic chunking: let the embeddings find the seam

Some text has no seams you can see: a transcript, scraped text whose line breaks were lost, OCR output, a long unbroken essay. **Semantic chunking** looks for the seams by meaning:

1. split into sentences;
2. embed each sentence;
3. for every gap between two sentences, measure how similar the text just before it is to the text just after it;
4. cut at the gaps where similarity dips (the "valleys"), since that is where the subject changes;
5. guard the result: no chunk shorter than a few sentences, none longer than a cap.

None of this is new. Hearst's TextTiling algorithm did it in the 1990s with word counts: it compared blocks of text on either side of each gap with cosine similarity, smoothed the curve, scored each valley by its depth, and set the cutoff from the mean and standard deviation of those depth scores (as described in the 1994 version of the paper, [Multi-Paragraph Segmentation of Expository Text](https://arxiv.org/abs/cmp-lg/9406037); the journal version is [Text Tiling](https://aclanthology.org/J97-1003/)). Modern semantic chunking swaps word counts for embeddings. LlamaIndex's `SemanticSplitterNodeParser`, for instance, "adaptively picks the breakpoint in-between sentences using embedding similarity" with parameters such as `buffer_size` and `breakpoint_percentile_threshold`, and its documentation advises that you may have to tune the percentile. The code here is a simplified descendant: windows of sentences, a threshold, and a minimum-size rule, with no smoothing or depth scores.

**The embedder.** Instead of calling a model, Block 3 builds one: a TF-IDF vector per sentence (rare, informative words weigh more), then a truncated SVD that keeps the `k` strongest directions of variation, so sentences that use different words about the same subject land closer together. This is latent semantic analysis (LSA), an old and genuine embedding method, though not a neural one. It is fitted here on just 48 sentences; a pretrained model has seen incomparably more text. Everything else in the chunker only needs a function `embed(texts) -> unit-length rows`, so a real model drops in (see [Module 02](../02-embedding-models-compared/README.md) for choosing one and [Module 05](../05-generating-embeddings-at-scale/README.md) for calling it).

**The test material.** Block 0 holds 6 topics of 8 sentences each, written by hand. A random document takes 4 topics, 4 to 7 sentences of each, in random order, so the true boundaries are known exactly. Volcanoes and earthquakes are deliberately related (shared plate and fault vocabulary): a realistic hard case. The embedder is fitted on the same 48 sentences the documents are drawn from, without using any boundary labels, which flatters the results; Exercise 4 shows the effect of fitting on less text.

What the experiments show (Blocks 6 and 7):

- **Windows beat single sentences.** Comparing sentence `g` with sentence `g+1` is noisy. Comparing the mean of the 3 sentences before a gap with the mean of the 3 after it is much better: F1 0.65 for window 1 against 0.77 for window 3 (k=8, threshold 0.3).
- **The threshold trades precision for recall.** On 200 documents with 3.0 true boundaries each (k=8, window 3), recall climbs from 0.28 at threshold 0.0 to about 0.80 at 0.6, while the number of breaks per document passes the true 3.0 around threshold 0.4 and precision falls from 0.81 to 0.67. F1 is flat between 0.74 and 0.78 for thresholds 0.2 to 0.6.
- **The related-topic boundary is the one that gets missed.** In the single 30-sentence document, thresholds up to 0.3 find the three clear boundaries with precision 1.00 and recall 0.75; the volcanoes/earthquakes boundary is only found "within one sentence" at 0.5. Raising the threshold to 0.9 produces 7 breaks for 4 true ones.
- **A good threshold does not transfer between embedders.** The best threshold in the grid ranges from 0.1 to 0.7 across the embedders in Block 7. A fixed 0.3 is close to the best for k=8 and k=16, but 0.07 to 0.10 F1 below the best for k=0, 4 and 32. A percentile rule ("cut at the lowest 30% of this document's own gaps") has no units, and here matched the best fixed threshold for all three embedders tested. But it assumes a roughly constant share of gaps are real boundaries, and in documents with no boundary at all it still cuts: it split 2 of 6 single-topic documents against 1 of 6 for the fixed threshold. Neither rule can say "this text is all one topic" reliably.
- **Exact boundaries are a harsh test.** Many errors are off by one sentence because the window blurs the valley (Exercise 3: F1 0.77 exact, 0.90 within one sentence). For retrieval a one-sentence displacement usually costs little; decide which error you can live with.

**What it costs.** Semantic chunking embeds every sentence once to find the seams, and then you embed the chunks as usual. Block 8 counts it on 200 held-out documents of one unbroken run of text: 26.4 embedding calls per document against 4.2 for the recursive splitter, and twice the words embedded (963 against 481). Embedding the windows as text instead of averaging sentence vectors would embed 5.5 times the document. Calls are small and numerous, so batch them (Module 05). Add the threshold tuning: you need labelled boundaries, or at least a retrieval test, to choose it.

**What it buys.** Block 8 again, same documents, an 800-character limit for the recursive splitter: on text that has paragraph breaks at the topic changes, the recursive splitter is perfect (every chunk holds one topic, every topic seam kept) at no extra cost. Raise the limit to 1,500 and only 39% of chunks hold a single topic, because the limit now merges neighbouring paragraphs. Remove the paragraph breaks and the recursive splitter manages 44% single-topic chunks and keeps 21% of the seams, while semantic chunking (threshold 0.4, the best in Block 7's grid, which used a different random sample) reaches 85% and 78%. That is the case it exists for. It is also a constructed case: sentences from clearly separate topics, an embedder that has seen them, and a threshold chosen on the same pool of sentences. Real documents have softer topic changes.

The one outside study I found is about cost: Qu, Tu and Bao ([Is Semantic Chunking Worth the Computational Cost?](https://arxiv.org/abs/2410.13070)) test semantic against fixed-size chunking on document retrieval, evidence retrieval and answer generation, and conclude according to the abstract that the computational cost is not justified by consistent performance gains. I have not reproduced their experiments, and I am quoting their conclusion, not a number.

> [!pitfall] The numbers above come from documents I constructed. They show how the method behaves (windows help, thresholds do not transfer, related topics are hard, cost is real), not how much it will help on your corpus. Build a small labelled set from your own documents before adopting it (see the Project).

**Late chunking** attacks a different weakness: chunks embedded in isolation lose the context around them. Günther et al. ([Late Chunking](https://arxiv.org/abs/2409.04701)) propose embedding the whole long text with a long-context embedding model first and applying the chunk boundaries afterwards, just before the pooling step, so each chunk vector has "seen" its neighbours. It needs a long-context embedding model and access to token-level outputs, so it is not executed in this module; you still have to decide where the chunks end.

### Parent-child (small-to-big) retrieval

Chunk size pulls two ways. Small chunks have precise vectors (one idea each) but hand the language model too little context; big chunks give context but blur many ideas into one vector. **Parent-child retrieval** splits the roles: embed and search small *children*, but return the big *parent* each matching child came from. Block 9 is a minimal implementation: children are sentences, parents are topic sections, and two children of one parent count once.

Variants appear in framework documentation. LlamaIndex's `SentenceWindowNodeParser` splits into single sentences and stores a surrounding window in metadata; its `HierarchicalNodeParser` chunks at several sizes with each child referencing its parent, and its `AutoMergingRetriever` can replace retrieved nodes with their parent when a majority of the children are retrieved ([Node Parser Modules](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/)).

On 14 hand-written questions over 6 parents and 48 children, Block 9 gives: searching the sentences alone returns the exact answer sentence for 7 of 14 questions (about 22 words of context); searching whole paragraphs returns the answer for 14 of 14 (176 words); small-to-big also gets 14 of 14. So on this toy, small-to-big matches the big index and rescues the small one: the best child was often a neighbouring sentence rather than the exact answer, but it was in the right parent every time. It costs 48 vectors in the index instead of 6, and returns a whole parent per hit. The toy is too easy to show the case small-to-big is built for (long parents whose single embedding is dominated by other content), so I do not claim a gain over the big index.

> [!model] A library catalogue and the shelf. You search the catalogue cards (small, precise, easy to match), then walk to the shelf and bring back the whole book (big, with context). The cost is a catalogue with a card for every page instead of one per book.

### Which one, when

| Your text | Start with | Why | Watch out for |
| --- | --- | --- | --- |
| Markdown or HTML with headings | Heading split with heading path, recursive splitter inside big sections | The seams are explicit and free | Tiny sections, fenced code, page boilerplate |
| Python source | `ast` split at definitions | Exact, no cutting through a function | Functions over the limit, syntax errors, other languages |
| Prose with paragraph breaks | Recursive splitter, limit near the paragraph size | Free; uses the author's seams | A limit much larger than a paragraph merges topics |
| One unbroken run of text (transcript, flattened OCR) | Sentence packing first; semantic chunking if you can measure a gain | There are no seams to use | Cost, tuning, uneven chunk sizes |
| Chunks lose their context | Parent-child retrieval, or late chunking with a long-context model | Precise match, wide context | Index size, parent size, model support |

No row says "always". The honest default is the cheapest splitter that respects the seams you have, then measure.

## Code

Standard library plus numpy only. The blocks are cumulative: copy them in order into one file (say `seams.py`) and run it. Outputs were produced with Python 3.13.14 and numpy 2.4.6; everything is seeded, and running the blocks extracted from this page in a fresh process reproduced every pasted output exactly. The whole file takes about 35 seconds on my machine. Block 5 reads three modules of your installed Python's standard library, so its counts will differ on another Python version; the invariants (`lossless` is `True`, `unavoidable` equals `cut (ast 2000)`) should not.

### 0. The test material

Six topics, eight hand-written sentences each. Volcanoes and earthquakes overlap on purpose.

```python
TOPICS = {
    "volcanoes": [
        'A volcano forms where molten rock from deep inside the Earth finds a path to the surface through a weakness in the crust.',
        'Magma that is rich in silica is thick and sticky, so trapped gas builds up pressure until the eruption turns explosive.',
        'Runny basaltic lava, by contrast, flows for kilometres and builds broad, gently sloping shield volcanoes such as those in Hawaii.',
        "Most of the world's active volcanoes sit along the edges of tectonic plates, especially where one plate slides beneath another.",
        'Volcanologists monitor swarms of small tremors and the swelling of the ground, because rising magma pushes the mountain outward before an eruption.',
        'A large ash cloud can ground aircraft for days, since fine glass particles melt inside jet engines and stop them.',
        'Sulfur dioxide from a big eruption reaches the stratosphere and forms droplets that reflect sunlight, cooling the planet for a year or two.',
        'After the lava cools, weathered volcanic ash makes some of the most fertile soil on Earth, which is why farmers return to the slopes.',
    ],
    "earthquakes": [
        'An earthquake happens when stress that has slowly built up along a fault is suddenly released as the rocks on either side slip past each other.',
        'The point underground where the slip begins is called the focus, and the spot on the surface directly above it is the epicentre.',
        'Seismometers record two main kinds of waves: fast compression waves that arrive first and slower shear waves that cause most of the damage.',
        'Magnitude is a logarithmic scale, so each whole step up means roughly thirty times more energy is released.',
        'Buildings with flexible steel frames and base isolators sway with the ground instead of cracking, which is why codes in seismic zones require them.',
        'Many faults lie along the same plate boundaries that host volcanoes, so the two hazards often threaten the same regions.',
        'An earthquake under the sea floor can lift the water above it and launch a tsunami that crosses an ocean in hours.',
        'Early warning systems detect the fast waves near the epicentre and send alerts that arrive seconds before the slower, damaging waves.',
    ],
    "sourdough": [
        'Sourdough bread rises without commercial yeast because a starter, a paste of flour and water, grows its own wild yeast and bacteria.',
        'To keep the starter alive you discard most of it every day and feed the rest with fresh flour and water.',
        'A bubbly starter that doubles within a few hours is ready to leaven a loaf.',
        'The dough then ferments slowly for many hours, and the bacteria produce the acids that give the bread its tangy flavour.',
        'Folding the dough every half hour builds gluten strength without any hard kneading.',
        'Just before baking, scoring the surface with a sharp blade lets the loaf expand evenly in the oven.',
        'Baking inside a heavy covered pot traps steam, which keeps the crust soft long enough for the bread to rise fully before it hardens.',
        'A good loaf has a crisp brown crust, an open crumb with irregular holes, and a flavour that keeps improving for a day.',
    ],
    "tcp": [
        'TCP provides a reliable byte stream by numbering every byte and requiring the receiver to acknowledge what it has received.',
        'A connection starts with a three-way handshake in which the client sends a SYN, the server replies with a SYN-ACK, and the client confirms with an ACK.',
        'If an acknowledgement does not arrive before the retransmission timer expires, the sender assumes the packet was lost and sends it again.',
        'The receiver advertises a window that tells the sender how much data it can buffer, which stops a fast sender from overwhelming a slow receiver.',
        'Congestion control adds a second limit, the congestion window, which grows while packets get through and shrinks sharply when a loss is detected.',
        'Slow start doubles the congestion window every round trip until it reaches a threshold and then switches to additive growth.',
        'Because every lost packet blocks the stream behind it, a single drop can stall an entire web page load, which motivated newer transports.',
        'Closing a connection takes a FIN and an ACK in each direction, and the side that closes first lingers in a TIME_WAIT state in case a final ACK is lost.',
    ],
    "chess": [
        'In the opening, both players try to control the centre of the board and bring their knights and bishops into play before moving any piece twice.',
        'Castling tucks the king behind a wall of pawns and activates a rook in a single move, so most games include it early.',
        'A fork is a tactic in which one piece, often a knight, attacks two valuable pieces at once, winning material because only one can escape.',
        'A pinned piece cannot move without exposing a more valuable piece behind it, which makes it a target for attack.',
        'In the middlegame a strong player looks for weak squares, open files for the rooks, and a pawn structure that restricts the opponent.',
        'Trading pieces helps the side that is ahead in material, because every exchange makes the extra pawn count for more.',
        'In the endgame the king becomes an active fighter, and knowing how to win with a lone pawn is worth more than memorizing openings.',
        'Draws occur by stalemate, repetition, or insufficient material, so a lost position can sometimes be saved by a perpetual check.',
    ],
    "photosynthesis": [
        'Photosynthesis is the process by which plants, algae and some bacteria turn light, water and carbon dioxide into sugar and oxygen.',
        'In plants the work happens inside chloroplasts, where green chlorophyll pigment absorbs mostly red and blue light and reflects green.',
        'The light reactions split water molecules, release oxygen as a by-product, and store the captured energy in the carriers ATP and NADPH.',
        'The Calvin cycle then uses that stored energy to fix carbon dioxide into three-carbon sugars, which the plant assembles into glucose and starch.',
        'Small pores in the leaf called stomata let carbon dioxide in, but each open pore also lets water vapour escape.',
        'Plants that live in hot, dry climates evolved tricks such as C4 and CAM photosynthesis to waste less water while fixing carbon.',
        'Light intensity, temperature and carbon dioxide concentration each limit the rate, and whichever is scarcest sets the pace.',
        'Over geological time, photosynthesis filled the atmosphere with oxygen, and most of the fossil fuel burned today is stored sunlight from ancient plants.',
    ],
}

names = list(TOPICS)
all_sentences = [s for name in names for s in TOPICS[name]]
print(len(names), "topics,", len(all_sentences), "sentences,", sum(len(s.split()) for s in all_sentences), "words")
print("longest sentence:", max(len(s) for s in all_sentences), "characters")
```

Output:

```
6 topics, 48 sentences, 1047 words
longest sentence: 152 characters
```

### 1. Sentence boundaries

```python
import re

ABBREVIATIONS = {"dr", "mr", "mrs", "ms", "prof", "st", "vs", "etc", "inc", "no", "fig", "approx"}

def split_sentences(text):
    """Lossless sentence splitter: every piece keeps its trailing whitespace, so ''.join(pieces) == text.
    A '.', '!' or '?' ends a sentence only if whitespace and then a capital letter, digit, quote or bracket
    follows, and the word before a '.' is not a known abbreviation or a single capital letter ('J. Smith')."""
    pieces, start = [], 0
    for m in re.finditer(r"([.!?]+)([\"')\]]*)(\s+)(?=[A-Z0-9\"'(\[])", text):
        word = re.search(r"(\w+)\W*$", text[start:m.start(1)])        # the word just before the terminator
        if m.group(1) == "." and word and (word.group(1).lower() in ABBREVIATIONS
                                           or (len(word.group(1)) == 1 and word.group(1).isupper())):
            continue                                                    # "Dr. Smith", "Fig. 3": not an end
        pieces.append(text[start:m.end()])
        start = m.end()
    if start < len(text):
        pieces.append(text[start:])
    return pieces

def pack_sentences(sentences, max_chars):
    """Greedy packing: add whole sentences to the current chunk until the next one would not fit."""
    chunks, current = [], ""
    for s in sentences:
        if current and len(current) + len(s) > max_chars:
            chunks.append(current)
            current = ""
        current += s
    if current:
        chunks.append(current)
    return chunks      # a single sentence longer than max_chars stays whole (recursive_split handles that)

tricky = ("Dr. Smith measured pi as 3.14 in the U.S. last year. The result, e.g. the first run, was odd! "
          "Was it a bug? No. It was a unit error. See Fig. 3 for details.")
naive = re.split(r"(?<=[.!?])\s+", tricky)
careful = split_sentences(tricky)
print("naive regex ->", len(naive), "pieces, e.g.", naive[:3])
print("careful splitter ->", len(careful), "pieces:")
for s in careful:
    print("   ", repr(s))
print("lossless:", "".join(careful) == tricky)

paragraph = " ".join(TOPICS["volcanoes"])
packed = pack_sentences(split_sentences(paragraph), 300)
print("\npacked into", len(packed), "chunks of", [len(c) for c in packed], "characters; every chunk ends with a full stop:",
      all(c.rstrip().endswith(".") for c in packed))
```

Output:

```
naive regex -> 10 pieces, e.g. ['Dr.', 'Smith measured pi as 3.14 in the U.S.', 'last year.']
careful splitter -> 5 pieces:
    'Dr. Smith measured pi as 3.14 in the U.S. last year. '
    'The result, e.g. the first run, was odd! '
    'Was it a bug? '
    'No. It was a unit error. '
    'See Fig. 3 for details.'
lossless: True

packed into 4 chunks of [242, 258, 262, 273] characters; every chunk ends with a full stop: True
```

### 2. A recursive splitter from scratch

`keep_split` builds a lossless splitter for one separator; `LEVELS` is the hierarchy.

```python
def keep_split(pattern):
    """Make a splitter that cuts after every match of `pattern` and keeps the matched text on the piece before it."""
    rx = re.compile(pattern)
    def split(text):
        pieces, start = [], 0
        for m in rx.finditer(text):
            if start < m.end() < len(text):
                pieces.append(text[start:m.end()])
                start = m.end()
        pieces.append(text[start:])
        return [p for p in pieces if p]
    return split

by_paragraph = keep_split(r"\n\s*\n")       # a blank line
by_line = keep_split(r"\n+")
by_word = keep_split(r"\s+")
LEVELS = [by_paragraph, by_line, split_sentences, by_word]              # coarse -> fine

def recursive_split(text, max_len, levels=LEVELS):
    """Cut `text` into chunks of at most max_len characters, at the coarsest boundary that works.
    Neighbouring small pieces are merged back up to max_len; a piece that is still too big is split again
    with the next finer level; only when the levels run out is it cut blindly."""
    if len(text) <= max_len:
        return [text]
    if not levels:                                             # last resort: a hard cut
        return [text[i:i + max_len] for i in range(0, len(text), max_len)]
    pieces = levels[0](text)
    if len(pieces) == 1:                                       # this level found nothing to cut at: go finer
        return recursive_split(text, max_len, levels[1:])
    chunks, buf = [], ""
    for p in pieces:
        if len(p) > max_len:                                   # too big on its own: flush, then recurse into it
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(recursive_split(p, max_len, levels[1:]))
        elif len(buf) + len(p) <= max_len:
            buf += p
        else:
            chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return chunks

def fixed_split(text, size):                                   # the blind baseline (Module 06 teaches it properly)
    return [text[i:i + size] for i in range(0, len(text), size)]

def ends_cleanly(chunk):
    return chunk.rstrip().endswith((".", "!", "?"))

doc = "\n\n".join(" ".join(TOPICS[t][:6]) for t in ("volcanoes", "sourdough", "tcp", "chess", "photosynthesis"))
print("document:", len(doc), "characters,", doc.count("\n\n") + 1, "paragraphs")
for name, chunks in (("fixed-size 500", fixed_split(doc, 500)), ("recursive 500", recursive_split(doc, 500))):
    sizes = [len(c) for c in chunks]
    clean = sum(ends_cleanly(c) for c in chunks)
    print(f"{name:15} chunks={len(chunks):2}  sizes {min(sizes)}-{max(sizes)}  end at a sentence end: {clean}/{len(chunks)}"
          f"  lossless: {''.join(chunks) == doc}")
print()
for c in recursive_split(doc, 500)[:4]:
    print(f"[{len(c):3}] starts {c[:28]!r}  ends {c.rstrip()[-34:]!r}")
```

Output:

```
document: 3765 characters, 5 paragraphs
fixed-size 500  chunks= 8  sizes 265-500  end at a sentence end: 3/8  lossless: True
recursive 500   chunks=10  sizes 185-500  end at a sentence end: 10/10  lossless: True

[500] starts 'A volcano forms where molten'  ends ' one plate slides beneath another.'
[263] starts 'Volcanologists monitor swarm'  ends ' inside jet engines and stop them.'
[435] starts 'Sourdough bread rises withou'  ends ' give the bread its tangy flavour.'
[185] starts 'Folding the dough every half'  ends 'he loaf expand evenly in the oven.'
```

### 3. A small embedder, built from scratch

TF-IDF and truncated SVD in numpy. The two means at the end confirm it embeds topics sensibly: sentences of one topic are close (0.57), volcanoes and earthquakes are somewhat close (0.20), unrelated topics are near zero (0.05).

```python
import random
import numpy as np

STOPWORDS = set("""a about after also an and any are as at be because been before between but by can did do does during each
every for from had has have how if in into is it its may might more most not of on one or over so some such than that the
their then there these they this to two under was were what when where which while who why will with without would you""".split())

def tokenize(text):
    out = []
    for word in re.findall(r"[a-z]+", text.lower()):
        if word in STOPWORDS or len(word) < 3:
            continue
        if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]                                  # crude plural stripping
        out.append(word)
    return out

class LSAEmbedder:
    """A small real embedder: TF-IDF vectors, then truncated SVD (latent semantic analysis).
    k=0 keeps the plain TF-IDF vectors. Rows of embed() are unit length, so a dot product is a cosine."""
    def __init__(self, k=8):
        self.k = k
    def fit(self, texts):
        docs = [tokenize(t) for t in texts]
        vocab = sorted({w for d in docs for w in d})
        self.index = {w: i for i, w in enumerate(vocab)}
        df = np.zeros(len(vocab))
        for d in docs:
            for w in set(d):
                df[self.index[w]] += 1
        self.idf = np.log((1 + len(docs)) / (1 + df)) + 1.0
        if self.k:
            _, _, vt = np.linalg.svd(self._tfidf(texts), full_matrices=False)
            self.components = vt[: self.k]                    # the k strongest directions of variation
        return self
    def _tfidf(self, texts):
        X = np.zeros((len(texts), len(self.index)))
        for row, text in enumerate(texts):
            for w in tokenize(text):
                if w in self.index:                           # words never seen in fit() are ignored
                    X[row, self.index[w]] += 1
        X *= self.idf
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        return X / np.where(norms == 0, 1, norms)
    def embed(self, texts):
        X = self._tfidf(texts)
        if self.k:
            X = X @ self.components.T
            norms = np.linalg.norm(X, axis=1, keepdims=True)
            X = X / np.where(norms == 0, 1, norms)
        return X

embedder = LSAEmbedder(k=8).fit(all_sentences)
E = embedder.embed(all_sentences)
topic_of = [name for name in names for _ in TOPICS[name]]
S = E @ E.T
same = np.array([[topic_of[i] == topic_of[j] and i != j for j in range(48)] for i in range(48)])
related = np.array([[{topic_of[i], topic_of[j]} == {"volcanoes", "earthquakes"} for j in range(48)] for i in range(48)])
other = ~same & ~related & ~np.eye(48, dtype=bool)
print("vocabulary:", len(embedder.index), "words ->", E.shape[1], "dimensions")
print(f"mean cosine, same topic: {S[same].mean():.2f} | volcanoes vs earthquakes: {S[related].mean():.2f} | other topics: {S[other].mean():.2f}")
```

Output:

```
vocabulary: 456 words -> 8 dimensions
mean cosine, same topic: 0.57 | volcanoes vs earthquakes: 0.20 | other topics: 0.05
```

### 4. Markdown at headings, with the heading path

```python
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")      # "## Title": a CommonMark ATX heading
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")                             # an opening or closing code fence

def split_markdown(md, max_len=600):
    """One chunk per heading section, each carrying its heading path (a list of titles).
    '#' lines inside fenced code blocks are code, not headings. A section longer than max_len is cut further
    with recursive_split, and every piece keeps the same path."""
    sections, path, buf, fence = [], [], [], None                       # path: [(level, title), ...]
    def flush():
        body = "".join(buf).strip()
        if body:
            sections.append({"path": [title for _, title in path], "text": body})
        buf.clear()
    for line in md.splitlines(keepends=True):
        f = FENCE.match(line)
        if fence is None and f:
            fence = f.group(1)                                          # entering a fenced block
        elif fence is not None and f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence):
            fence = None                                                # the closing fence
        h = HEADING.match(line) if fence is None and not f else None
        if h:
            flush()
            level = len(h.group(1))
            while path and path[-1][0] >= level:                        # a new "##" closes the previous "##" and its "###"s
                path.pop()
            path.append((level, h.group(2)))
        else:
            buf.append(line)
    flush()
    return [{"path": s["path"], "text": piece.strip()} for s in sections for piece in recursive_split(s["text"], max_len)]

TICKS = "`" * 3                                                          # built here so this snippet can sit inside a Markdown code fence
PAGE = f"""# Acme Queue

Acme Queue is a managed message queue with a Python client and a worker daemon.

## Client library

### Timeouts

The default is 30 seconds.

## Worker daemon

### Timeouts

The default is 5 seconds.

### Installation

{TICKS}bash
# install the daemon
pip install acme-worker
{TICKS}
"""
sections = split_markdown(PAGE)
for s in sections:
    print(" > ".join(s["path"]).ljust(42), "|", s["text"].splitlines()[0])
print(len(sections), "chunks;", sum("# install" in s["text"] for s in sections), "chunk keeps its '# install ...' line as code instead of starting a new heading")

query = "how long is the worker daemon timeout by default"
for label, texts in (("body only", [s["text"] for s in sections]),
                     ("path + body", [" > ".join(s["path"]) + "\n" + s["text"] for s in sections])):
    tfidf = LSAEmbedder(k=0).fit(texts)                                 # plain TF-IDF is enough for this demo
    scores = tfidf.embed(texts) @ tfidf.embed([query])[0]
    print(f"\nembedding the {label}:")
    for i in np.argsort(-scores)[:3]:
        print(f"   {scores[i]:.3f}  {' > '.join(sections[i]['path'])}")
```

Output:

```
Acme Queue                                 | Acme Queue is a managed message queue with a Python client and a worker daemon.
Acme Queue > Client library > Timeouts     | The default is 30 seconds.
Acme Queue > Worker daemon > Timeouts      | The default is 5 seconds.
Acme Queue > Worker daemon > Installation  | ```bash
4 chunks; 1 chunk keeps its '# install ...' line as code instead of starting a new heading

embedding the body only:
   0.408  Acme Queue > Client library > Timeouts
   0.408  Acme Queue > Worker daemon > Timeouts
   0.325  Acme Queue > Worker daemon > Installation

embedding the path + body:
   0.799  Acme Queue > Worker daemon > Timeouts
   0.432  Acme Queue > Client library > Timeouts
   0.333  Acme Queue > Worker daemon > Installation
```

### 5. Python at function and class boundaries

```python
import ast, io

DEFS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
CODE_LINES = [keep_split(r"\n+")]                  # the only separator left for code that is too big or does not parse

def first_line(node, lines):
    """0-based index of the first line of a definition: its decorators, and the comment lines directly above."""
    first = min([node.lineno] + [d.lineno for d in node.decorator_list])   # a decorated def's lineno is the 'def' line
    i = first - 1
    while i > 0 and lines[i - 1].lstrip().startswith("#"):
        i -= 1
    return i

def end_line(node, lines):
    """0-based exclusive end: the definition's last line plus the blank lines after it."""
    j = node.end_lineno
    while j < len(lines) and not lines[j].strip():
        j += 1
    return j

def code_units(body, lines, lo, hi):
    """Cut lines[lo:hi] into (start, end, node) units: one per definition, one per run of other statements."""
    cuts = {lo, hi}
    for node in body:
        if isinstance(node, DEFS):
            cuts.update((first_line(node, lines), end_line(node, lines)))
    cuts = sorted(c for c in cuts if lo <= c <= hi)
    defined_at = {first_line(n, lines): n for n in body if isinstance(n, DEFS)}
    return [(a, b, defined_at.get(a)) for a, b in zip(cuts, cuts[1:])]

def split_python(source, max_len=2000):
    """Split Python source at function and class boundaries. The chunks tile the file: ''.join(texts) == source.
    A class that is too big is cut into its methods (each keeps 'class Name' as context); a function that is too
    big falls back to its lines; source that does not parse falls back to lines too."""
    lines = io.StringIO(source).readlines()               # cut on "\n" only, the way the parser counts lines
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [{"context": "", "text": t} for t in recursive_split(source, max_len, CODE_LINES)]
    def walk(body, lo, hi, context):
        out = []
        for a, b, node in code_units(body, lines, lo, hi):
            text = "".join(lines[a:b])
            if len(text) <= max_len:
                out.append({"context": context, "text": text})
            elif isinstance(node, ast.ClassDef):
                out.extend(walk(node.body, a, b, f"class {node.name}"))
            else:
                name = f"{context} > {node.name}" if node else context
                out.extend({"context": name, "text": t} for t in recursive_split(text, max_len, CODE_LINES))
        return out
    merged = []                                            # pack small neighbours back together
    for unit in walk(tree.body, 0, len(lines), ""):
        if merged and merged[-1]["context"] == unit["context"] and len(merged[-1]["text"]) + len(unit["text"]) <= max_len:
            merged[-1]["text"] += unit["text"]
        else:
            merged.append(dict(unit))
    return merged

def cut_functions(source, texts, limit):
    """Functions and methods with a chunk boundary inside them. Also counts the unavoidable ones: a function longer
    than `limit` (or nested in one) cannot fit in any chunk."""
    lines = io.StringIO(source).readlines()
    starts, pos = [], 0
    for t in texts[:-1]:
        pos += t.count("\n")
        starts.append(pos)                                 # 0-based line where the next chunk begins
    tree = ast.parse(source)
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            child.parent = parent
    funcs = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    size = lambda n: len("".join(lines[first_line(n, lines):n.end_lineno]))
    cut = unavoidable = 0
    for n in funcs:
        if any(first_line(n, lines) < s < n.end_lineno for s in starts):
            cut += 1
            chain, p = [n], n
            while hasattr(p, "parent"):
                p = p.parent
                if isinstance(p, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    chain.append(p)
            unavoidable += any(size(c) > limit for c in chain)
    return len(funcs), cut, unavoidable

SAMPLE = '''import functools

TEMPLATE = """
def {name}(x):
    return x + {n}
"""

# cached recursive version
@functools.lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


class Stack:
    def push(self, x):
        self.items.append(x)
'''
text_style = keep_split(r"\n(?=class |def |\tdef )")(SAMPLE)       # a separator list like the Python one in LangChain's docs
print("separator-style splitting (start ... end of each piece):")
for piece in text_style:
    print("   ", repr(piece[:22]), "...", repr(piece[-26:]))
chunks = split_python(SAMPLE, max_len=170)
print("ast-based splitting (start ... end of each chunk):")
for c in chunks:
    print("   ", repr(c["text"][:22]), "...", repr(c["text"][-26:]))
tree = ast.parse(SAMPLE)
print("lossless:", "".join(c["text"] for c in chunks) == SAMPLE,
      "| decorated def: lineno =", tree.body[2].lineno, "but its decorator is on line", tree.body[2].decorator_list[0].lineno)
broken = SAMPLE + "def oops(:\n"
fallback = split_python(broken, max_len=170)
print("source with a syntax error ->", len(fallback), "chunks from the line fallback, lossless:", "".join(c["text"] for c in fallback) == broken)

form_feed = "x = 1\n\x0c\ndef f():\n    return 2\n"
print("a form feed in the source: str.splitlines() finds", len(form_feed.splitlines()), "lines, io.StringIO.readlines() finds",
      len(io.StringIO(form_feed).readlines()), "; the parser puts 'def f' on line", ast.parse(form_feed).body[1].lineno)

import textwrap, statistics, functools
print(f"\n{'module':11}{'lines':>6}{'functions':>10}{'cut (fixed 2000)':>18}{'cut (ast 2000)':>16}{'of those unavoidable':>22}{'chunks':>8}  lossless")
for mod in (textwrap, statistics, functools):
    source = open(mod.__file__, encoding="utf-8").read()
    texts = [c["text"] for c in split_python(source, 2000)]
    n_funcs, cut_fixed, _ = cut_functions(source, fixed_split(source, 2000), 2000)
    _, cut_ast, unavoidable = cut_functions(source, texts, 2000)
    print(f"{mod.__name__:11}{source.count(chr(10)):>6}{n_funcs:>10}{cut_fixed:>18}{cut_ast:>16}{unavoidable:>22}{len(texts):>8}  {''.join(texts) == source}")
```

Output:

```
separator-style splitting (start ... end of each piece):
    'import functools\n\nTEMP' ... 'functools\n\nTEMPLATE = """\n'
    'def {name}(x):\n    ret' ... 's.lru_cache(maxsize=None)\n'
    'def fib(n):\n    return' ... 'fib(n - 1) + fib(n - 2)\n\n\n'
    'class Stack:\n    def p' ... '     self.items.append(x)\n'
ast-based splitting (start ... end of each chunk):
    'import functools\n\nTEMP' ... ':\n    return x + {n}\n"""\n\n'
    '# cached recursive ver' ... 'fib(n - 1) + fib(n - 2)\n\n\n'
    'class Stack:\n    def p' ... '     self.items.append(x)\n'
lossless: True | decorated def: lineno = 10 but its decorator is on line 9
source with a syntax error -> 2 chunks from the line fallback, lossless: True
a form feed in the source: str.splitlines() finds 5 lines, io.StringIO.readlines() finds 4 ; the parser puts 'def f' on line 3

module      lines functions  cut (fixed 2000)  cut (ast 2000)  of those unavoidable  chunks  lossless
textwrap      497        14                 5               1                     1      13  True
statistics   1817        71                21               5                     5      42  True
functools    1036        69                18               8                     8      28  True
```

Every function the `ast` splitter still cuts is one that is longer than the 2,000-character limit (or nested inside one), which is what the `unavoidable` column checks. The fixed-size cutter, with the same limit, cuts 5, 21 and 18 functions against the `ast` splitter's 1, 5 and 8.

### 6. Semantic chunking on one document

A 30-sentence document in which I know the four boundaries. The last four lines are a text rendering of the similarity curve: lighter characters are lower similarity, `^` marks the true boundaries and `v` the breaks chosen at threshold 0.4.

```python
def gap_similarities(embedder, sentences, window=3):
    """sims[g]: cosine between the mean vector of the `window` sentences before gap g and the `window` after it.
    Each sentence is embedded once; the windows are built by averaging (this is the TextTiling idea, with vectors)."""
    V = embedder.embed(sentences)
    sims = []
    for g in range(len(sentences) - 1):
        left = V[max(0, g - window + 1): g + 1].mean(axis=0)
        right = V[g + 1: g + 1 + window].mean(axis=0)
        sims.append(left @ right / (np.linalg.norm(left) * np.linalg.norm(right) + 1e-12))
    return np.array(sims)

def pick_breaks(sims, threshold, min_sentences=3):
    """Deepest valleys first. Accept a gap whose similarity is below the threshold unless it would leave a chunk
    shorter than min_sentences; that rule also stops one wide valley from producing several breaks."""
    n = len(sims) + 1
    breaks = []
    for g in np.argsort(sims):
        g = int(g)
        if sims[g] >= threshold:
            break
        if g + 1 < min_sentences or n - (g + 1) < min_sentences:
            continue
        if all(abs(g - b) >= min_sentences for b in breaks):
            breaks.append(g)
    return sorted(breaks)

def semantic_chunks(text, embedder, threshold, window=3, min_sentences=3, max_chars=1500):
    """Cut `text` at semantic breaks between sentences. The chunks tile the text: ''.join(chunks) == text."""
    sentences = split_sentences(text)
    breaks = pick_breaks(gap_similarities(embedder, sentences, window), threshold, min_sentences)
    edges = [0] + [b + 1 for b in breaks] + [len(sentences)]
    chunks = []
    for a, b in zip(edges, edges[1:]):
        chunks.extend(recursive_split("".join(sentences[a:b]), max_chars))      # a long quiet stretch still gets a size cap
    return chunks

def boundary_scores(predicted, true, tolerance=0):
    """Precision: share of predicted breaks that are real. Recall: share of real breaks that were found.
    A gap is the space between sentence g and g+1; tolerance=1 also accepts a break one sentence off."""
    near = lambda g, others: any(abs(g - o) <= tolerance for o in others)
    precision = sum(near(p, true) for p in predicted) / len(predicted) if predicted else 0.0
    recall = sum(near(t, predicted) for t in true) / len(true)
    return precision, recall

order = ["volcanoes", "earthquakes", "sourdough", "tcp", "photosynthesis"]
sentences = [s for t in order for s in TOPICS[t][:6]]
labels = [t for t in order for _ in range(6)]
true_breaks = [g for g in range(len(sentences) - 1) if labels[g] != labels[g + 1]]
sims = gap_similarities(embedder, sentences)
print(len(sentences), "sentences; true boundaries after sentence index", true_breaks)
print("\n                                          exact          within 1 sentence")
print("threshold  predicted breaks              precision recall   precision recall")
for threshold in (0.0, 0.3, 0.5, 0.7, 0.9):
    breaks = pick_breaks(sims, threshold)
    p0, r0 = boundary_scores(breaks, true_breaks)
    p1, r1 = boundary_scores(breaks, true_breaks, tolerance=1)
    print(f"{threshold:9.1f}  {str(breaks):28} {p0:9.2f} {r0:6.2f}   {p1:9.2f} {r1:6.2f}")

ramp = " .:-=+*#"                                           # 8 levels, low similarity -> high
level = lambda s: ramp[int(np.clip((s + 0.4) / 1.4 * (len(ramp) - 1), 0, len(ramp) - 1))]
breaks_04 = pick_breaks(sims, 0.4)
print("\nsimilarity curve, one character per gap (a valley is where the character is light):")
print("  gap          " + "".join(str(g % 10) for g in range(len(sims))))
print("  similarity   " + "".join(level(s) for s in sims))
print("  true         " + "".join("^" if g in true_breaks else " " for g in range(len(sims))))
print("  chosen at 0.4" + "".join("v" if g in breaks_04 else " " for g in range(len(sims))), "  breaks:", breaks_04)
```

Output:

```
30 sentences; true boundaries after sentence index [5, 11, 17, 23]

                                          exact          within 1 sentence
threshold  predicted breaks              precision recall   precision recall
      0.0  [11, 17, 23]                      1.00   0.75        1.00   0.75
      0.3  [11, 17, 23]                      1.00   0.75        1.00   0.75
      0.5  [6, 11, 17, 23]                   0.75   0.75        1.00   1.00
      0.7  [3, 6, 11, 17, 23]                0.60   0.75        0.80   1.00
      0.9  [3, 6, 11, 14, 17, 20, 23]        0.43   0.75        0.57   1.00

similarity curve, one character per gap (a valley is where the character is light):
  gap          01234567890123456789012345678
  similarity   :+*===-++-. =**+:.=++==.-+***
  true              ^     ^     ^     ^     
  chosen at 0.4      v    v     v     v        breaks: [6, 11, 17, 23]
```

### 7. Semantic chunking on 200 random documents

```python
def make_document(rng, n_topics=4, lo=4, hi=7):
    """A random multi-topic document with known boundaries: 4 topics, 4-7 of each topic's sentences, topics in random order."""
    sentences, labels = [], []
    for name in rng.sample(names, n_topics):
        for i in sorted(rng.sample(range(8), rng.randint(lo, hi))):
            sentences.append(TOPICS[name][i])
            labels.append(name)
    truth = [g for g in range(len(sentences) - 1) if labels[g] != labels[g + 1]]
    return sentences, labels, truth

rng = random.Random(0)
documents = [make_document(rng) for _ in range(200)]
print(len(documents), "documents,", f"{np.mean([len(d[0]) for d in documents]):.1f} sentences and",
      f"{np.mean([len(d[2]) for d in documents]):.1f} true boundaries on average")

def evaluate(embedder, threshold, window=3, tolerance=0, min_sentences=3, percentile=None):
    """Mean precision / recall / F1 over the 200 documents, and the mean number of breaks predicted per document.
    With percentile=p the cut-off is not `threshold` but the p-th percentile of that document's own gap similarities."""
    scores, n_pred = [], []
    for sentences, labels, truth in documents:
        sims = gap_similarities(embedder, sentences, window)
        cutoff = np.percentile(sims, percentile) if percentile is not None else threshold
        breaks = pick_breaks(sims, cutoff, min_sentences)
        scores.append(boundary_scores(breaks, truth, tolerance))
        n_pred.append(len(breaks))
    p, r = np.mean(scores, axis=0)
    return p, r, (2 * p * r / (p + r) if p + r else 0.0), np.mean(n_pred)

THRESHOLDS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7)
print("\nLSA k=8, window 3: sweeping the threshold")
print("threshold  precision  recall     F1   breaks/doc (true: 3.0)")
for threshold in THRESHOLDS:
    p, r, f, n = evaluate(embedder, threshold)
    print(f"{threshold:9.1f}  {p:9.2f}  {r:6.2f}  {f:5.2f}   {n:5.2f}")

print("\nthreshold 0.3 with different embedders (k) and windows; the last two columns are the best threshold in the grid")
print("  k  window  precision  recall     F1   best threshold  its F1")
models = {k: LSAEmbedder(k=k).fit(all_sentences) for k in (0, 4, 8, 16, 32)}
for k, model in models.items():
    for window in (1, 3):
        p, r, f, _ = evaluate(model, 0.3, window)
        best_f, best_t = max((evaluate(model, t, window)[2], t) for t in THRESHOLDS)
        print(f"{k:3}  {window:6}  {p:9.2f}  {r:6.2f}  {f:5.2f}   {best_t:14.1f}  {best_f:6.2f}")

print("\nF1 at window 3: a fixed threshold, the best fixed threshold, and a per-document percentile rule")
print("  k   fixed 0.3   best fixed (t)   lowest 10%   lowest 20%   lowest 30%")
for k in (4, 8, 16):
    fixed = evaluate(models[k], 0.3)[2]
    best_f, best_t = max((evaluate(models[k], t)[2], t) for t in THRESHOLDS)
    pcts = [evaluate(models[k], None, percentile=q)[2] for q in (10, 20, 30)]
    print(f"{k:3}   {fixed:9.2f}   {best_f:9.2f} ({best_t:.1f})   {pcts[0]:10.2f}   {pcts[1]:10.2f}   {pcts[2]:10.2f}")

print("\nsingle-topic documents (all 8 sentences of one topic, so no true boundary):")
for label, cutoff_of in (("threshold 0.3", lambda s: 0.3), ("lowest 20% rule", lambda s: np.percentile(s, 20))):
    found = {}
    for name in names:
        sims = gap_similarities(embedder, TOPICS[name])
        found[name] = pick_breaks(sims, cutoff_of(sims))
    print(f"  {label:16} splits {sum(1 for b in found.values() if b)} of {len(names)} documents for no reason:",
          {name: b for name, b in found.items() if b} or "none")
```

Output:

```
200 documents, 22.1 sentences and 3.0 true boundaries on average

LSA k=8, window 3: sweeping the threshold
threshold  precision  recall     F1   breaks/doc (true: 3.0)
      0.0       0.59    0.28   0.38    1.03
      0.1       0.80    0.55   0.65    1.95
      0.2       0.81    0.68   0.74    2.50
      0.3       0.80    0.75   0.77    2.83
      0.4       0.77    0.79   0.78    3.15
      0.5       0.72    0.79   0.75    3.44
      0.6       0.69    0.80   0.74    3.64
      0.7       0.67    0.80   0.73    3.79

threshold 0.3 with different embedders (k) and windows; the last two columns are the best threshold in the grid
  k  window  precision  recall     F1   best threshold  its F1
  0       1       0.27    0.46   0.34              0.1    0.35
  0       3       0.45    0.71   0.55              0.1    0.65
  4       1       0.68    0.62   0.65              0.7    0.66
  4       3       0.85    0.52   0.65              0.7    0.73
  8       1       0.61    0.69   0.65              0.5    0.67
  8       3       0.80    0.75   0.77              0.4    0.78
 16       1       0.32    0.43   0.36              0.2    0.37
 16       3       0.63    0.67   0.65              0.2    0.66
 32       1       0.13    0.22   0.17              0.1    0.17
 32       3       0.41    0.57   0.48              0.1    0.55

F1 at window 3: a fixed threshold, the best fixed threshold, and a per-document percentile rule
  k   fixed 0.3   best fixed (t)   lowest 10%   lowest 20%   lowest 30%
  4        0.65        0.73 (0.7)         0.66         0.73         0.73
  8        0.77        0.78 (0.4)         0.64         0.76         0.78
 16        0.65        0.66 (0.2)         0.50         0.62         0.66

single-topic documents (all 8 sentences of one topic, so no true boundary):
  threshold 0.3    splits 1 of 6 documents for no reason: {'sourdough': [4]}
  lowest 20% rule  splits 2 of 6 documents for no reason: {'volcanoes': [3], 'sourdough': [4]}
```

### 8. Seams, semantics and cost, side by side

The 200 documents here are new random combinations (a different seed from block 7); the threshold 0.4 was chosen in block 7. "One topic" is the share of chunks whose sentences all belong to one topic; "seams kept" is the share of true topic changes where no chunk contains sentences from both sides.

```python
def build_text(sentences, labels, paged):
    """Join sentences into one string and return it with each sentence's (start, end) character span.
    paged=True puts a blank line where the topic changes, like an author's paragraphs; paged=False is one run of text."""
    text, spans = "", []
    for i, s in enumerate(sentences):
        if i:
            text += "\n\n" if paged and labels[i] != labels[i - 1] else " "
        spans.append((len(text), len(text) + len(s)))
        text += s
    return text, spans

fresh = random.Random(1)
held_out = [make_document(fresh) for _ in range(200)]          # new random combinations; the threshold was chosen on seed 0
ok = all(split_sentences(build_text(s, l, False)[0]) == [x + " " for x in s[:-1]] + [s[-1]] for s, l, _ in held_out)
print("split_sentences recovers every sentence of all 200 held-out documents exactly:", ok)

def chunk_report(name, chunker, paged, semantic=False):
    sizes, pure, seams, calls, words = [], [], [], [], []
    for sentences, labels, truth in held_out:
        text, spans = build_text(sentences, labels, paged)
        chunks = chunker(text)
        assert "".join(chunks) == text                         # no character lost or invented
        pos, touched = 0, []
        for c in chunks:                                       # which sentences does each chunk touch?
            touched.append({i for i, (s, e) in enumerate(spans) if s < pos + len(c) and e > pos})
            pos += len(c)
        sizes += [len(c) for c in chunks]
        pure.append(np.mean([len({labels[i] for i in t}) == 1 for t in touched if t]))
        seams.append(np.mean([not any(g in t and g + 1 in t for t in touched) for g in truth]))
        calls.append(len(chunks) + (len(sentences) if semantic else 0))
        words.append(len(text.split()) * (2 if semantic else 1))
    print(f"{name:38}{len(sizes) / 200:7.1f}{np.mean(sizes):8.0f} ({min(sizes):3}-{max(sizes):4}){np.mean(pure):8.2f}{np.mean(seams):8.2f}"
          f"{np.mean(calls):9.1f}{np.mean(words):9.0f}")

print(f"\n{'':38}{'chunks':>7}{'chars/chunk':>20}{'one':>8}{'seams':>8}{'embed':>9}{'words':>9}")
print(f"{'':38}{'/doc':>7}{'mean (min-max)':>20}{'topic':>8}{'kept':>8}{'calls':>9}{'embedded':>9}")
chunk_report("recursive 800, with paragraph breaks", lambda t: recursive_split(t, 800), paged=True)
chunk_report("recursive 1500, with paragraph breaks", lambda t: recursive_split(t, 1500), paged=True)
chunk_report("recursive 800, one run of text", lambda t: recursive_split(t, 800), paged=False)
chunk_report("semantic 0.4 (cap 1500), one run", lambda t: semantic_chunks(t, embedder, 0.4), paged=False, semantic=True)

doc_words = np.mean([len(" ".join(s).split()) for s, _, _ in held_out])
as_text = np.mean([sum(len(" ".join(s[max(0, g - 2): g + 1]).split()) + len(" ".join(s[g + 1: g + 4]).split())
                       for g in range(len(s) - 1)) for s, _, _ in held_out])
print(f"\nif the 3-sentence windows were embedded as text instead of averaging sentence vectors: {as_text:.0f} words per document"
      f" ({as_text / doc_words:.1f}x the document)")
```

Output:

```
split_sentences recovers every sentence of all 200 held-out documents exactly: True

                                       chunks         chars/chunk     one   seams    embed    words
                                         /doc      mean (min-max)   topic    kept    calls embedded
recursive 800, with paragraph breaks      5.2     544 (114- 800)    1.00    1.00      5.2      481
recursive 1500, with paragraph breaks     2.6    1080 (489-1500)    0.39    0.54      2.6      481
recursive 800, one run of text            4.2     673 (116- 800)    0.44    0.21      4.2      481
semantic 0.4 (cap 1500), one run          4.3     665 (114-1448)    0.85    0.78     26.4      963

if the 3-sentence windows were embedded as text instead of averaging sentence vectors: 2624 words per document (5.5x the document)
```

### 9. Small-to-big retrieval

```python
class SmallToBig:
    """Index small children (here: sentences) but hand back the big parent (here: a whole topic section).
    A match on any child retrieves its parent; two children of the same parent count once."""
    def __init__(self, embedder, parents, split_children):
        self.embedder, self.parents = embedder, parents
        self.children = [(pid, child.strip()) for pid, parent in enumerate(parents) for child in split_children(parent)]
        self.vectors = embedder.embed([child for _, child in self.children])
    def search(self, query, k=1):
        scores = self.vectors @ self.embedder.embed([query])[0]
        hits, seen = [], set()
        for i in np.argsort(-scores):
            pid, child = self.children[i]
            if pid in seen:
                continue
            seen.add(pid)
            hits.append({"parent": pid, "score": float(scores[i]), "matched": child})
            if len(hits) == k:
                break
        return hits

QUERIES = [                                  # (question, topic, index of the sentence that answers it)
    ("why do airplanes have to avoid volcanic ash", "volcanoes", 5),
    ("which kind of lava builds gently sloping mountains", "volcanoes", 2),
    ("how do scientists tell a volcano is about to erupt", "volcanoes", 4),
    ("what does magnitude mean on the earthquake scale", "earthquakes", 3),
    ("how can a quake cause a tsunami", "earthquakes", 6),
    ("why does bread dough need to be folded", "sourdough", 4),
    ("how often should the starter be fed", "sourdough", 1),
    ("what happens when an acknowledgement is lost", "tcp", 2),
    ("how does slow start grow the window", "tcp", 5),
    ("how does the SYN handshake open a connection", "tcp", 1),
    ("what is a fork tactic", "chess", 2),
    ("how does castling protect the king", "chess", 1),
    ("why do plants open stomata", "photosynthesis", 4),
    ("what is the Calvin cycle", "photosynthesis", 3),
]
parents = [" ".join(TOPICS[name]) for name in names]
index = SmallToBig(embedder, parents, split_sentences)
parent_vectors = embedder.embed(parents)

returned = {"small only": [], "big only": [], "small-to-big": []}                 # the text each strategy hands to the LLM
for question, topic, i in QUERIES:
    best_child = index.search(question)[0]
    returned["small only"].append(best_child["matched"])                           # the child itself
    returned["big only"].append(parents[int(np.argmax(parent_vectors @ embedder.embed([question])[0]))])
    returned["small-to-big"].append(parents[best_child["parent"]])                 # child found, parent returned
print(f"index sizes: {len(parents)} parents, {len(index.children)} children")
print(f"questions whose answer sentence is inside the returned text, out of {len(QUERIES)}:")
for strategy, texts in returned.items():
    hits = sum(TOPICS[topic][i] in text for text, (_, topic, i) in zip(texts, QUERIES))
    print(f"  {strategy:13} {hits:2}   (returns {np.mean([len(t.split()) for t in texts]):.0f} words on average)")

question = "why do airplanes have to avoid volcanic ash"
hit = index.search(question, k=2)
print(f"\nquery: {question!r}")
for h in hit:
    print(f"  parent {h['parent']} ({names[h['parent']]}), best child score {h['score']:.2f}: {h['matched'][:70]!r}...")
```

Output:

```
index sizes: 6 parents, 48 children
questions whose answer sentence is inside the returned text, out of 14:
  small only     7   (returns 22 words on average)
  big only      14   (returns 176 words on average)
  small-to-big  14   (returns 176 words on average)

query: 'why do airplanes have to avoid volcanic ash'
  parent 0 (volcanoes), best child score 0.97: 'After the lava cools, weathered volcanic ash makes some of the most fe'...
  parent 1 (earthquakes), best child score 0.92: 'Buildings with flexible steel frames and base isolators sway with the '...
```

### Using a real embedding model

Nothing above needs LSA specifically. Any function `embed(texts)` that returns one unit-length row per text can replace `LSAEmbedder` in blocks 6 to 9: a local sentence-embedding model, or a hosted API wrapped with the batching and caching from [Module 05](../05-generating-embeddings-at-scale/README.md). I did not run one for this module (no neural model or API key is available where it was verified), so every number here belongs to the LSA embedder. Expect the shape of the results to carry over (windows help, valleys at related topics are weak, cost scales with sentences) and the numbers, especially the best threshold, to change. Re-tune on your own labelled sample.

### What these experiments do not show

- Anything about end-to-end retrieval quality or answer quality on real questions; they measure boundaries and chunk purity on constructed documents, plus one 14-question toy.
- The behaviour of a pretrained neural embedder.
- Real PDFs, HTML pages, tables, or code in languages other than Python.
- Statistical confidence: the 200 documents are random recombinations of the same 48 sentences, so they are not independent samples.

## Visual diagram

```
 THE RECURSIVE SPLITTER   recursive_split(text, max_len)

   text ──► longer than max_len? ──no──► emit it as one chunk
                   │ yes
                   ▼
         ┌──────────────────────────────┐      levels, coarse to fine:
         │ cut at the coarsest level    │ ◄──  paragraph > line > sentence > word
         │ that finds a seam            │      and, only if all fail, a blind cut
         └───────────────┬──────────────┘
                         ▼
         ┌──────────────────────────────┐
         │ merge neighbouring pieces    │      block 2: 10 of 10 chunks end on a
         │ while they still fit         │      sentence end (fixed size: 3 of 8)
         └───────────────┬──────────────┘
                         ▼
   a piece still longer than max_len? ──yes──► same steps on that piece, one level finer
                         │ no
                         ▼
                      chunks


 SEMANTIC CHUNKING   (numbers from block 6: 30 sentences, 29 gaps, window 3, k=8)

   sentences     s0 s1 s2 [s3 s4 s5] | [s6 s7 s8] s9 ...     each sentence embedded once: v0 v1 v2 ...
                          left   gap 5   right
                 gap 5 = cosine( mean(v3, v4, v5), mean(v6, v7, v8) )

     gap          01234567890123456789012345678       gap number (last digit)
     similarity   :+*===-++-. =**+:.=++==.-+***       similarity: a lighter character is a lower value, a valley
     true              ^     ^     ^     ^            ^ the four true topic changes
     chosen at 0.4      v    v     v     v            v the breaks chosen at threshold 0.4 (deepest valleys first)

          ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   chunks │ s0..s6  │ │ s7..s11 │ │ s12..s17│ │ s18..s23│ │ s24..s29│    guards: >= 3 sentences each, size cap
          └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
   the first break landed one gap late (6, not 5), so s6, the first earthquake sentence, joins the volcano chunk
   cost: every sentence is embedded once to find the seams, then every chunk is embedded again


 PARENT-CHILD (SMALL-TO-BIG)

    ingest                                            query time
    ┌───────────────────────┐  split   ┌───────┐
    │ parent (big section)  │ ───────► │ child │──┐   embed and index ONLY the children
    │ kept whole in a store │          ├───────┤  │
    │ under parent_id       │          │ child │──┤        question ──► embed
    └───────────────────────┘          ├───────┤  │                       │
                                       │ child │──┘                       ▼
                                       └───────┘               nearest children (top k)
                                                                          │
                                                       look up each parent_id, drop repeats
                                                                          ▼
                                                      return the PARENT text to the model
    cost: the index holds N children, not N parents (48 vs 6 in block 9)
```

## Practice

### 1. When the levels run out

Cut a 390-character string with no space, newline or full stop into pieces of at most 100 characters with `recursive_split`. How many chunks end at a `;`, which is the natural seam in the string? Then add one finer level for `;`.

<details><summary>Answer</summary>

```python
blob = "user_id=42;session=abc123;action=login;" * 10                   # 390 characters: no space, no newline, no full stop
plain = recursive_split(blob, 100)
print("default levels :", len(plain), "chunks, sizes", [len(c) for c in plain], "| end at a ';':", sum(c.endswith(";") for c in plain))
by_semicolon = keep_split(r";")
better = recursive_split(blob, 100, LEVELS + [by_semicolon])          # add one finer level below 'word'
print("with a ';' level:", len(better), "chunks, sizes", [len(c) for c in better], "| end at a ';':", sum(c.endswith(";") for c in better))
print("first chunk, default :", plain[0][-24:])
print("first chunk, with ';':", better[0][-24:])
print("both lossless:", "".join(plain) == blob and "".join(better) == blob)
```

Output:

```
default levels : 4 chunks, sizes [100, 100, 100, 90] | end at a ';': 1
with a ';' level: 5 chunks, sizes [89, 93, 91, 89, 28] | end at a ';': 5
first chunk, default : n;user_id=42;session=abc
first chunk, with ';': action=login;user_id=42;
both lossless: True
```

With the default levels nothing matches any separator, so the splitter hard-cuts every 100 characters and only 1 of 4 chunks happens to end at a `;`. Adding a level for the seam you know about makes all 5 chunks end at one. The pattern generalizes: a splitter is only as good as its separator list for your data (URLs, log lines, CSV rows).

</details>

### 2. The stranded decorator

Without changing `split_python`, make `first_line` trust `node.lineno` only, and count chunks of the standard library's `enum.py` (limit 1000) whose last line is a decorator.

<details><summary>Answer</summary>

```python
import enum

def stranded_decorators(source, max_len=1000):
    """Chunks whose last non-blank line is a decorator: it was cut off from the function it belongs to."""
    texts = [c["text"] for c in split_python(source, max_len)]
    return sum(t.rstrip().splitlines()[-1].lstrip().startswith("@") for t in texts if t.strip())

source = open(enum.__file__, encoding="utf-8").read()
decorated = sum(1 for n in ast.walk(ast.parse(source)) if isinstance(n, DEFS) and n.decorator_list)
print("decorated definitions in enum.py:", decorated)
print("stranded decorators, using first_line()       :", stranded_decorators(source))
real_first_line = first_line
first_line = lambda node, lines: node.lineno - 1                      # the naive version: trust node.lineno
print("stranded decorators, using node.lineno only   :", stranded_decorators(source))
first_line = real_first_line                                           # restore
print("stranded decorators, after restoring          :", stranded_decorators(source))
```

Output:

```
decorated definitions in enum.py: 19
stranded decorators, using first_line()       : 0
stranded decorators, using node.lineno only   : 8
stranded decorators, after restoring          : 0
```

Of 19 decorated definitions, 8 lose their decorator to the end of the previous chunk when the splitter trusts `node.lineno`, because for a decorated function it names the `def` line, not the decorator. The chunk holding the function then starts with `def`, and the chunk before it ends with a dangling decorator line.

</details>

### 3. How wrong is "wrong"?

Evaluate the semantic chunker on the 200 documents at thresholds 0.3 and 0.5, once requiring exact boundaries and once accepting a break one sentence away (`tolerance=1`). What does the difference tell you?

<details><summary>Answer</summary>

```python
for tolerance in (0, 1):
    for threshold in (0.3, 0.5):
        p, r, f, n = evaluate(embedder, threshold, tolerance=tolerance)
        print(f"tolerance {tolerance}  threshold {threshold}:  precision {p:.2f}  recall {r:.2f}  F1 {f:.2f}  ({n:.2f} breaks/doc)")
```

Output:

```
tolerance 0  threshold 0.3:  precision 0.80  recall 0.75  F1 0.77  (2.83 breaks/doc)
tolerance 0  threshold 0.5:  precision 0.72  recall 0.79  F1 0.75  (3.44 breaks/doc)
tolerance 1  threshold 0.3:  precision 0.93  recall 0.87  F1 0.90  (2.83 breaks/doc)
tolerance 1  threshold 0.5:  precision 0.85  recall 0.95  F1 0.90  (3.44 breaks/doc)
```

Accepting one sentence of slack lifts F1 from about 0.76 to 0.90 at both thresholds, so many "errors" at tolerance 0 are valleys that landed one sentence away from the true seam (at threshold 0.3, about two thirds of the wrong breaks and about half of the missed boundaries), not breaks in the middle of a topic. That is a very different failure from a break in the wrong place entirely. Report both numbers, and decide which matters for your retrieval (a boundary sentence attached to the neighbouring chunk is usually a mild error).

</details>

### 4. A weaker embedder

Fit the embedder on fewer sentences (2, 4 or all 8 per topic) and evaluate the same 200 documents at threshold 0.3. How much does the quality of the embedder matter?

<details><summary>Answer</summary>

```python
print("sentences fitted  vocabulary  precision  recall     F1     (threshold 0.3, window 3)")
for per_topic in (2, 4, 8):
    fit_texts = [TOPICS[name][i] for i in range(per_topic) for name in names]
    model = LSAEmbedder(k=8).fit(fit_texts)
    p, r, f, _ = evaluate(model, 0.3)
    print(f"{len(fit_texts):16}  {len(model.index):10}  {p:9.2f}  {r:6.2f}  {f:5.2f}")
```

Output:

```
sentences fitted  vocabulary  precision  recall     F1     (threshold 0.3, window 3)
              12         137       0.71    0.55   0.62
              24         250       0.77    0.69   0.73
              48         456       0.80    0.75   0.77
```

F1 rises from 0.62 to 0.73 to 0.77 as the embedder sees more text. With 12 fitting sentences, many words in the documents are unknown to the embedder and are ignored, so the sentence vectors carry less signal. The chunking logic is identical in all three rows; the embedder is the variable. This is also why a pretrained model, which has seen vastly more text than 48 sentences, is the sensible choice outside a teaching module (not run here).

</details>

### Checkpoint quiz

1. The recursive splitter merges neighbouring small pieces back up to the limit. Why, and what does that cost?
2. Why is `node.lineno` not enough to find where a decorated function starts?
3. Which step of semantic chunking costs embedding calls, and how did block 8 reduce the token cost?
4. You tuned a similarity threshold of 0.3 on embedder A and now switch to embedder B. What do you expect and what do you do?
5. In small-to-big retrieval, what is embedded, what is returned, and what does it cost?

<details><summary>Answers</summary>

1. Without merging, every sentence or line would become its own tiny chunk. The cost is that the limit, not the topic, decides what is merged: a limit larger than a section glues neighbouring sections together (block 8: 1.00 single-topic chunks at 800 characters, 0.39 at 1,500).
2. For a decorated function `lineno` is the `def` line; the decorators sit above it and are listed in `decorator_list`. Take the minimum of those line numbers or the decorator ends up in the previous chunk (Exercise 2: 8 of 19).
3. Embedding every sentence to compare neighbours: about 22 sentence embeddings per document in block 8 on top of the chunk embeddings. Averaging the sentence vectors into windows keeps the cost at 1 times the document's words for finding seams; embedding each window as text would cost about 5.5 times.
4. Expect the old threshold to be wrong: the best threshold ranged from 0.1 to 0.7 across the embedders in block 7. Re-tune on a labelled sample of your own documents, or use a per-document percentile rule, and re-measure.
5. The small children are embedded and indexed; the best child's parent is returned (repeats removed). The cost is a larger index (48 vectors instead of 6 in block 9) and more text returned per hit.

</details>

> [!check]
> - I can write a lossless sentence splitter and explain where rules like mine fail.
> - I can implement a recursive splitter and test that it is lossless, respects the limit and falls back sensibly.
> - I can split Markdown by heading while keeping the heading path and ignoring `#` inside code fences.
> - I can split Python with `ast`, handling decorators, comments, big classes and unparseable source.
> - I can build a TF-IDF plus SVD embedder and use it to find topic boundaries, and I can score boundary precision and recall.
> - I can explain why semantic thresholds do not transfer between embedders.
> - I can describe small-to-big retrieval and what it costs.
> - I can say when semantic chunking is not worth its cost.

## Project

Build `chunk_corpus.py`, a small tool that picks a splitter per file and proves it behaves. For each file it chooses by type and content: Markdown gets the heading splitter, `.py` files get the `ast` splitter, plain text with paragraph breaks gets the recursive splitter, and plain text without usable breaks gets sentence packing or, behind a flag, semantic chunking. Every strategy must hand back chunks that tile the input exactly, respect a size limit even on hostile input (an empty file, one 10,000-character word, a file with only headings, an unclosed code fence, a Python file with a syntax error), and carry their context (heading path or class name).

Write property tests with seeded random inputs for the invariants (lossless, size limit, determinism) and hand-labelled examples for the heading paths. For the semantic path, write your own multi-topic documents from at least three topics you know, label the boundaries, report boundary precision and recall at three or more thresholds with a tolerance of 0 and of 1, and show what happens to a single-topic document. Produce a cost report (embedding calls and words embedded) for semantic against recursive on the same text. Finish with a retrieval check: write 20 questions with known answer sentences, run recursive and semantic chunks through the same embedder, and measure how often the answer sentence is inside the top-3 chunks. End with a paragraph recommending a default for your documents and the evidence for it. No code is given; design the module boundaries and the tests yourself.

## Interview questions

> [!interview] A teammate wants to switch the RAG ingestion from recursive splitting to semantic chunking "because it is smarter". How do you evaluate that proposal?

<details><summary>What a strong answer covers</summary>

- Semantic chunking costs more: every sentence is embedded to find the seams, plus the chunks, plus threshold tuning; chunk sizes become uneven, so guards (minimum and maximum size) are needed.
- The gain depends on the documents. If they have paragraph breaks or headings at the topic changes, the recursive or structure-aware splitter already finds the seams for free; semantic chunking helps most on text with no visible structure (transcripts, flattened OCR).
- Evidence from outside is mixed: at least one published study concludes the cost is not justified by consistent gains over fixed-size chunking (Qu, Tu and Bao).
- How to decide: build a labelled set (boundaries and/or questions with known answers), compare end-to-end retrieval (hit rate in the top k) and cost on your own corpus, report variance, and only switch if the gain survives.
- Thresholds are embedder-specific; changing the embedding model later means re-tuning.

</details>

> [!interview] You are chunking a repository that contains Python code and Markdown documentation for a code assistant. What do you do for each, and what can go wrong?

<details><summary>What a strong answer covers</summary>

- Python: parse with `ast`, split at function and class boundaries, keep decorators and the comments above a definition with it, cut oversized classes into methods and tag them with the class name, fall back to line-based splitting for oversized functions or code that does not parse.
- Markdown: split at headings and keep the heading path, in the embedded text and/or in metadata; ignore `#` inside fenced code; apply a size guard to oversized sections and handle tiny ones.
- Common failures: a decorator stranded from its function, headings invented from shell comments, chunks over the embedding model's input limit, module-level statements dropped, duplicate section titles that need the whole path to be distinguishable.
- Other languages need their own parser or a separator-based fallback.

</details>

> [!interview] Explain parent-child (small-to-big) retrieval. What does it fix, what does it cost, and when might it not help?

<details><summary>What a strong answer covers</summary>

- Small chunks give precise vectors but little context; big chunks give context but blurred vectors. Embed and search small children, return their larger parent.
- Implementation points: children carry a `parent_id`; parents live in a document store; repeats of the same parent are removed; the parent must still fit the model's context budget.
- Costs: more vectors in the index (one per child), more text returned per hit, extra storage and a lookup. Variants: sentence windows, hierarchical sizes with auto-merging of children into a parent.
- It may not help when parents are already short, when the matching child is in the wrong parent, or when queries need information spread across parents. Measure it against the plain big-chunk index instead of assuming a gain; in this module's toy it matched the big index and did not beat it.

</details>

## Common mistakes & troubleshooting

- **Chunks of code begin with a function body and the previous chunk ends in `@something`.** The splitter used `node.lineno` for decorated functions. Take the minimum over `decorator_list` (Exercise 2).
- **A Markdown README produces many bogus one-line "sections".** The heading regex also matched `# comment` lines inside fenced code. Track the fence state (block 4).
- **Section chunks exceed the embedding model's input limit.** Splitting at headings gives one chunk per section whatever its size. Run an oversize section through the recursive splitter, keeping the same heading path (Module 05 explains what happens to input past the limit).
- **Two chunks look identical in the index.** Sections with the same title under different parents. Use the whole heading path, not the last title.
- **Line numbers are off by one after a form feed, and function boundaries land in the wrong place.** The source was split with `str.splitlines()`, which splits on more than `\n`; the parser counts only newlines (block 5).
- **The sentence splitter returns `Dr.` as a sentence or merges two sentences.** Abbreviations and decimals. Add to the abbreviation list for your domain, test on real samples, and prefer merging errors to splitting errors; check the language assumptions.
- **The semantic chunker returns one-sentence chunks, or one giant chunk.** The threshold is wrong for this embedder (block 7: it does not transfer), or the minimum-size and cap guards are missing. Re-tune on labelled data or use a per-document percentile rule, and keep both guards.
- **Boundary scores look terrible but retrieval looks fine.** Many errors are off by one sentence (Exercise 3). Score with tolerance 1 as well, and judge by retrieval.
- **The same parent comes back three times in small-to-big results.** Children of one parent were not de-duplicated before returning parents (block 9 keeps a `seen` set).

## Further reading & sources

- [ast - Abstract syntax trees - Python documentation](https://docs.python.org/3/library/ast.html) - the node classes, `lineno` and `end_lineno`, `decorator_list` and `ast.parse`, the basis of the code splitter. Checked Oct 2026; the page shows the current docs version, while the code here ran on 3.13.
- [Text splitter integrations - Docs by LangChain](https://docs.langchain.com/oss/python/integrations/splitters) - the catalogue of splitters (recursive, Markdown, code, HTML, JSON) and the advice to start with the recursive character splitter.
- [Splitting recursively - Text splitter integration guide - Docs by LangChain](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter) - documents the default separator list and how `chunk_size` is measured; the reference for the separator hierarchy in block 2.
- [Node Parser Modules | Developer Documentation](https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/) - LlamaIndex's sentence, semantic, sentence-window, hierarchical, Markdown, HTML and code node parsers, and auto-merging retrieval for parent-child setups.
- [Multi-Paragraph Segmentation of Expository Text](https://arxiv.org/abs/cmp-lg/9406037) - Hearst's 1994 paper introducing TextTiling (cosine between adjacent blocks, smoothing, depth scores), the ancestor of semantic chunking; the journal version is [Text Tiling](https://aclanthology.org/J97-1003/).
- [Is Semantic Chunking Worth the Computational Cost?](https://arxiv.org/abs/2410.13070) - Qu, Tu and Bao (2024), the outside evidence on whether semantic chunking pays for itself; the abstract concludes the cost is not justified by consistent gains over fixed-size chunking.
- [Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models](https://arxiv.org/abs/2409.04701) - Günther et al. (2024): embed the whole text first and chunk before pooling, an alternative way to keep context.
- [CommonMark Spec](https://spec.commonmark.org/0.31.2/) - the definition of ATX headings and fenced code blocks that the Markdown splitter relies on.

## Next

[Module 08: Chunk Overlap and Metadata](../08-chunk-overlap-and-metadata/README.md)
