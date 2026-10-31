# Module 12: Open-Weight Models: Llama, Mistral, Qwen

## Roadmap

**Where this sits.** Track 06 started with OpenAI's API (Modules 00-09), then two more hosted APIs: [Module 10: The Anthropic Claude API](../10-the-anthropic-claude-api/README.md) and [Module 11: The Google Gemini API](../11-the-google-gemini-api/README.md). All of them run on someone else's computers behind an API key. This module is the other option: download the model's weights and run them yourself, or pay someone else to run them. [Module 13: The Hugging Face Ecosystem](../13-the-hugging-face-ecosystem/README.md) covers the Hub and the libraries these weights come with, and [Module 14: Small Language Models (SLMs)](../14-small-language-models/README.md) covers how to choose a size.

**Prerequisites.** [Track 01 Module 10: Chat Templates and Message Formatting](../../01-tokens-and-language-modeling/10-chat-templates-and-message-formatting/README.md), [Track 05 Module 05: Calculating a Model's Memory Requirements](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md) (its formulas are re-stated below only as far as needed), and [Track 04 Module 15: Quantization: INT8, INT4, GGUF](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md).

**After this module you can:**

- Say what "open-weight" promises and what it does not, and why it is not the same as "open source".
- Read a licence for its operative conditions (who may use the model, what you must display or pass on, what a user-count threshold does) without mistaking that reading for legal advice.
- Read a model card and a `config.json`, and from the config alone estimate parameter count, weight memory and KV-cache memory, then check the estimate against the Hub.
- Tell a base model from an instruct model and render a conversation the way each expects.
- Find a publisher's quantised builds and turn their file sizes into bits per weight.
- Apply a six-point checklist to decide between open weights and a hosted API, with a break-even calculation.

**Why it matters.** Choosing open weights moves three things onto you: legal obligations (the licence), sizing (will it fit, how fast), and operations (someone must run it). Each has a cheap way to check before you commit, and this module is those checks.

**Date stamp and ground rules.** Repository facts (licence fields, sizes, file lists, commit hashes) were fetched from the Hugging Face Hub, and licence texts from their official locations, on 2026-10-26. They change. The repository page, its `LICENSE` file and the Hub API are the source of truth, so re-run the listings before relying on any row. Nothing here is legal advice. This module makes no capability claims and prints no benchmark numbers: whether a model is good enough is something you measure on your own task ([Module 14](../14-small-language-models/README.md) builds the harness).

## Concept

> [!key] "Open-weight" means the trained parameters can be downloaded, usually under a licence with conditions of its own. It does not mean the training data, the training code, or permission to do anything you like is open. Two small files answer most planning questions: the licence says what you may do, and `config.json` says what it costs to run.

## Explanation

### What "open-weight" means, and what it does not

A language model, as a thing you can hold, is four artifacts: the **architecture** (code that describes the layers), the **weights** (billions of learned numbers, also called parameters), the **tokenizer**, and the **recipe** that produced them (training code and the data). A hosted API gives you none of these, only the output. An **open-weight** model gives you the weights (and enough config and tokenizer to run them). It may or may not give you the rest.

The Open Source Initiative has published a definition of what "open source" would need to mean for AI. The Open Source AI Definition 1.0 (page fetched 2026-10-26) says an Open Source AI is one made available under terms that grant four freedoms (use, study, modify, share), and that:

> "The preferred form of making modifications to a machine-learning system must include all the elements below: Data Information ... Code ... Parameters."

It describes Data Information as "sufficiently detailed information about the data used to train the system so that a skilled person can build a substantially equivalent system", Code as "the complete source code used to train and run the system", and Parameters as "model parameters, such as weights", each under OSI-approved terms. It also says that "Open Source weights" "must include the data information and code used to derive those parameters". By that definition, weights on their own are one of three required pieces. That is the gap between *open-weight* and *open source*.

The older Open Source Definition (fetched the same day) adds two criteria worth keeping in mind when you read model licences below: criterion 5, "The license must not discriminate against any person or group of persons", and criterion 6, "The license must not restrict anyone from making use of the program in a specific field of endeavor." This module does not rule on whether a given model licence meets them; it shows you the clauses so you can see what the question looks like.

> [!model] Three separate questions, three separate answers. *Can I download it?* (open-weight). *What may I do with it?* (the licence, which differs per family, size and release). *Can I study and rebuild it?* (what the OSI definition asks for: data information, code, parameters). A model can say yes to the first and still need a licence request for the second and have nothing public for the third.

> [!pitfall] A model name, a blog post or a Hub tag saying "open" tells you nothing about permissions. Read the licence file of the exact repository and revision you will ship, not the vendor's headline.

### Anatomy of a model repository

A model on the Hub is a repository (Module 13 covers the Hub). The file list for `Qwen/Qwen2.5-7B-Instruct`, fetched 2026-10-26, is a typical shape:

| File | What it is |
|---|---|
| `README.md` | the **model card**: a YAML header (`license`, `base_model`, `library_name`, `language`) followed by prose |
| `LICENSE` | the licence text. Not every repo has one: at fetch time the file lists of `mistralai/Mistral-7B-v0.1` and `mistralai/Mistral-7B-Instruct-v0.3` contain no `LICENSE`; the licence is declared only in the card's YAML (`license: apache-2.0`) |
| `config.json` | the architecture numbers (layers, widths, heads, vocabulary), the basis for every size estimate here |
| `generation_config.json` | the publisher's default decoding settings. For this repo: `temperature` 0.7, `top_p` 0.8, `top_k` 20, `repetition_penalty` 1.05, and two end-of-sequence ids (151645 and 151643). Sampling terms are in [Track 01 Module 16](../../01-tokens-and-language-modeling/16-sampling-strategies-greedy-temperature-top-k-top-p/README.md); your server may override them |
| `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt` | the tokenizer, plus its special tokens and (often) the **chat template** |
| `model-0000N-of-0000M.safetensors` and `model.safetensors.index.json` | the weights split into shards, and an index recording `total_size` in bytes and which tensor lives in which shard |

Two variations to expect. `mistralai/Mistral-7B-v0.1` ships both `.safetensors` and legacy `pytorch_model-*.bin` copies of the same weights (the `.bin` format is pickle-based; Module 13 explains why that matters). `mistralai/Mistral-7B-Instruct-v0.3` also ships `consolidated.safetensors`, `params.json` and `tokenizer.model.v3`, which belong to Mistral's own `mistral-inference` code path that its card recommends: one repository can carry two loading routes.

### Licences in practice

A licence is a contract you accept by downloading or using the files. The same family can use different licences across sizes and releases, so the only reliable procedure is to read the text in the repository you will actually ship. Listing 1 reads the Hub's public metadata for twelve repositories, and Listing 2 fetches nine licence texts and extracts a few facts from each. The facts below come from those listings and from the texts themselves.

**Apache-2.0** (Version 2.0, January 2004; `license: apache-2.0` on the Mistral 7B repos and on several Qwen2.5 sizes). Section 2 grants "a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work". Section 4 conditions redistribution on (a) giving recipients "a copy of this License" and (b) making modified files "carry prominent notices stating that You changed the files". There is a patent grant (Section 3) and no user-count threshold.

**Llama Community Licences.** Meta publishes a separate licence per release in its `meta-llama/llama-models` repository (the directory listing fetched 2026-10-26 has `llama2`, `llama3`, `llama3_1`, `llama3_2`, `llama3_3` and `llama4`), and the Hub licence list has an identifier for each (`llama2` through `llama4`). The Llama 3.1 text (Version Release Date: July 23, 2024) has these operative parts:

- Grant (1.a): "a non-exclusive, worldwide, non-transferable and royalty-free limited license ... to use, reproduce, distribute, copy, create derivative works of, and make modifications to the Llama Materials."
- Redistribution (1.b.i): provide "a copy of this Agreement" and "prominently display 'Built with Llama'"; and if you use the materials "or any outputs or results" to "create, train, fine tune, or otherwise improve an AI model, which is distributed or made available, you shall also include 'Llama' at the beginning of any such AI model name."
- Use policy (1.b.iv): use must "adhere to the Acceptable Use Policy", which is "incorporated by reference" (a separate document that can change on its own schedule).
- Scale threshold (2): if "on the Llama 3.1 version release date" the licensee's (or its affiliates') products had "greater than 700 million monthly active users in the preceding calendar month", "you must request a license from Meta, which Meta may grant to you in its sole discretion" and the rights above do not apply until Meta grants them.
- "AS IS" warranty disclaimer (3), and termination of the licence if you sue Meta over IP in the materials or outputs (5.c).

The versions differ. Listing 2 shows that the Llama 2 and Llama 3 texts contain a clause the later ones do not: "You will not use the Llama Materials or any output or results of the Llama Materials to improve any other large language model (excluding Llama 2 or derivative works thereof)." (Llama 2, 1.b.v; Llama 3 has the same sentence with its own name.) Llama 3.1 replaces it with the naming rule above, and Listing 2 shows the clause absent from the 3.2, 3.3 and 4 texts as well. The attribution string also changes ("Built with Meta Llama 3" versus "Built with Llama"). If you plan to train a smaller model on a larger model's outputs (distillation, Module 14), this is exactly the clause you need to find.

**Qwen licences.** The Qwen2.5 family is a good case of one family and several licences. In the Hub metadata fetched for Listing 1, the 0.5B, 1.5B, 7B, 14B and 32B repos declare `apache-2.0`; the 3B repo declares `license: other` with `license_name: qwen-research`; the 72B repo declares `other` with `license_name: qwen`. (The Hub's licence documentation says that for `other`, the licence text goes in a `LICENSE` file in the repo and a name in `license_name`.) The two non-Apache texts, both "Release Date: September 19, 2024":

- **Qwen LICENSE AGREEMENT** (72B repo): the grant is a "non-exclusive, worldwide, non-transferable and royalty-free limited license", Section 4 says "If you are commercially using the Materials, and your product or service has more than 100 million monthly active users, you shall request a license from us. You cannot exercise your rights under this Agreement without our express authorization", and Section 5.b requires displaying "Built with Qwen" or "Improved using Qwen" if you use the materials or outputs to train an AI model that is distributed.
- **Qwen RESEARCH LICENSE AGREEMENT** (3B repo): the grant is "FOR NON-COMMERCIAL PURPOSES ONLY", the text defines "Non-Commercial" as "for research or evaluation purposes only", and it adds "If you are commercially using the Materials, you shall request a license from us."

Meta's own Hugging Face repositories are **gated**: the Hub's public API still returns their metadata (including the licence name and the access prompt), but `config.json` answered `401` in Listing 1 (fetching the repo's `LICENSE` file answered `401` as well when tested separately). The licence texts used here come from Meta's public GitHub repository instead, and the Llama 3.1 architecture row in Listing 3 is built from the Llama 3 paper rather than read from a config. Where a number was fitted rather than read, the listing says so.

Rules of thumb from the above, none of them legal advice:

1. **Per release, per size.** Never write "Qwen is Apache" or "Llama allows commercial use" in a design document. Write the repo id, the revision and the licence file you read.
2. **The card's `license:` field is a label the uploader chose.** The `LICENSE` file, where one exists, is the text. For `other`, read the file.
3. **Look for three kinds of conditions.** *Who and how much*: a user-count threshold (700 million or 100 million monthly active users above) or a non-commercial restriction. *What you must do*: pass on a copy of the licence, display an attribution string, prefix a derived model's name. *What you must not do*: an acceptable-use policy by reference, and (in some versions) training other models on outputs.
4. **Derivatives carry obligations.** A fine-tune, a merge or a quantised conversion is a derivative of the original; its own card should say what it was derived from, and the original's conditions generally travel with it. Ask counsel when you redistribute.
5. **Gating is access control, not licence terms.** On a gated repo the authors "can decide at any time to block your access to the model without prior notice" (Hub gated-models documentation). Mirror what you ship into storage you control, with the licence text.

> [!pitfall] The keyword table in Listing 2 is triage, not a legal reading. It can tell you that a text contains "Acceptable Use Policy"; it cannot tell you what is in that policy or whether your product is covered.

### How to read a model card

The Hub's model-card documentation says a card should describe the model, its intended uses and limitations, training parameters, the datasets used, and evaluation results. Read it in this order:

1. **The YAML header**: `license`, `base_model` (what this repo was derived from, so you can find the upstream licence), `library_name`, languages.
2. **Which stage it is**: pretrained base, instruction-tuned, or a domain variant. The Mistral-7B-v0.1 card says "Mistral 7B is a pretrained base model and therefore does not have any moderation mechanisms."
3. **The architecture list**, and compare it with `config.json`. The Qwen2.5-7B-Instruct card lists 7.61B parameters, 6.53B of them non-embedding, 28 layers, and "28 for Q and 4 for KV" attention heads (grouped-query attention). Listing 3 reproduces both parameter figures from the config.
4. **Context statements, with their fine print.** The same card says "Context Length: Full 131,072 tokens and generation 8192 tokens", and its "Processing Long Texts" section then says "The current `config.json` is set for context length up to 32,768 tokens", with a YaRN `rope_scaling` snippet to add to the config for longer inputs and a warning that vLLM "only supports static YARN ... potentially impacting performance on shorter texts". The config says 32,768 (`max_position_embeddings`), the headline says 131,072, and the card explains the difference. Always read both.
5. **Limitations and notices**, then **evaluation claims**. A card's benchmark statements are the publisher's own, under conditions the card may not give. The Mistral-7B-v0.1 card has a one-line comparison with a larger model ("on all benchmarks we tested"); the Qwen card sends you to a blog. This module repeats neither: treat such lines as pointers to what to measure yourself, and note the date and the setting if you do cite one.

### Reading `config.json`

This is the (trimmed) `config.json` of `Qwen/Qwen2.5-7B-Instruct` as fetched:

```json
{
  "architectures": ["Qwen2ForCausalLM"],
  "model_type": "qwen2",
  "hidden_size": 3584,
  "intermediate_size": 18944,
  "num_hidden_layers": 28,
  "num_attention_heads": 28,
  "num_key_value_heads": 4,
  "vocab_size": 152064,
  "max_position_embeddings": 32768,
  "rope_theta": 1000000.0,
  "sliding_window": 131072,
  "use_sliding_window": false,
  "tie_word_embeddings": false,
  "torch_dtype": "bfloat16"
}
```

| Key | Meaning | Used for |
|---|---|---|
| `hidden_size` (`d`) | width of the residual stream | parameter count; head size `d / a` |
| `num_hidden_layers` (`L`) | transformer blocks | parameter count; KV cache |
| `num_attention_heads` (`a`) | query heads | head size; attention size |
| `num_key_value_heads` (`g`) | key/value heads; absent means `g = a` | KV cache (grouped-query attention shrinks it by `a / g`) |
| `intermediate_size` (`f`) | MLP inner width | parameter count |
| `vocab_size` (`V`) | tokens in the vocabulary | embedding table, output head |
| `tie_word_embeddings` | output head shares the embedding table | halves the `V x d` term when true |
| `max_position_embeddings` | longest context the config declares | upper bound on prompt plus output |
| `sliding_window` / `use_sliding_window` | windowed attention, if enabled | KV cache can be smaller than the full-attention formula |
| `torch_dtype` | precision the weights were saved in | bytes per parameter on disk |
| `auto_map` (not present here) | the repo ships its own Python modelling code | a security decision (Module 13) |

From [Track 05 Module 05](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md), restated: for a Llama-style decoder, with head size `d_h = d / a` unless the config gives `head_dim`,

- parameters `P = L * (d*a*d_h + 2*d*g*d_h + a*d_h*d + 3*d*f + 2*d) + V*d + (V*d if untied) + d`, plus `a*d_h + 2*g*d_h` per layer when the attention projections have biases (the Qwen2.5 card lists "Attention QKV bias");
- weight bytes `= P x bytes per parameter` (2 for bf16, 0.5 for an ideal 4-bit);
- KV bytes per token `= 2 * L * g * d_h * bytes per number`, multiplied by context length and number of simultaneous sequences.

Sliding-window attention (Mistral-7B-v0.1's config sets `sliding_window` to 4096) means a stack that implements a rolling cache holds less than this formula says for long contexts, so the formula gives an upper bound there.

### Sizes, base versus instruct, and variants

Model names carry a rounded parameter count: Listing 1 shows `Qwen2.5-7B` really has 7,615,616,512 parameters, and Listing 3 shows how the size ladder looks in memory (0.5B to 72B in the Qwen2.5 family, per its card: "ranging from 0.5 to 72 billion parameters").

A **base** model is the output of pretraining: it continues text. An **instruct** (or chat) model is a base model that went through further training to follow instructions and a conversation format ([Track 04 Module 05](../../04-training-fine-tuning-and-alignment/05-supervised-fine-tuning/README.md) and [Module 06](../../04-training-fine-tuning-and-alignment/06-instruction-tuning/README.md)). Listing 4 shows what that changes in the repo: `Mistral-7B-v0.1` has no `chat_template` in its tokenizer config and `Mistral-7B-Instruct-v0.3` has one, while for Qwen both the base and the instruct repo carry a template but their `eos_token` differs (`<|endoftext|>` versus `<|im_end|>`). Do not assume a base model lacks a template, and do check which token ends an assistant turn.

Beyond base and instruct, the Qwen2.5 technical report abstract says the open-weight offering "include[s] base and instruction-tuned models, with quantized versions available", and the Hub search in Listing 5 shows the publisher's other repos for the same size class: `Coder`, `Math` and `VL` (vision-language) variants and a `7B-Instruct-1M` variant. Read each variant's own card and licence rather than inferring them from the base model.

### Chat templates

[Track 01 Module 10](../../01-tokens-and-language-modeling/10-chat-templates-and-message-formatting/README.md) explains that a model only sees one flat string, and the **chat template** is the recipe turning a list of messages into it. Open-weight models differ in the recipe, and the difference is visible in Listing 4: Qwen wraps every turn in `<|im_start|>role ... <|im_end|>` and supplies a default system prompt if you give none; the Mistral v0.3 template accepts an optional first system message but has no system block of its own (it prepends that text to the last user turn), and it raises an error if the roles after it do not alternate. Use the tokenizer's `apply_chat_template` (Module 13) or a server's chat endpoint instead of formatting strings by hand: a model that receives a format it was not trained on raises no error, and the damage tends to show up as quietly worse answers.

### Where to find quantised builds

[Track 04 Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) explains quantisation and GGUF. Where the files live:

- **The publisher's own repos**, named by suffix: Listing 5 finds `-GGUF`, `-AWQ`, `-GPTQ-Int4` and `-GPTQ-Int8` repos for Qwen2.5-7B-Instruct. Same organisation means the same licence file to read and a known origin.
- **Community conversions.** Anyone can upload one. The Hub documents a GGUF filter (`hf.co/models?library=gguf`) and a conversion tool (`ggml-org/gguf-my-repo`). A third-party repo has its own author, card and security posture; check its `base_model`, its licence and who made it.
- **Formats.** GGUF is the single-file format used by llama.cpp and the tools built on it ([Track 05 Module 14](../../05-gpus-and-genai-hardware/14-running-models-on-cpu-and-apple-silicon/README.md)); GPTQ and AWQ are GPU-serving formats (Track 14 covers quantised serving).

The nominal bits in a name are not the size on disk. Listing 5 divides real file sizes by the parameter count: the `q4_k_m` file works out to about 4.9 bits per weight although the Hub's GGUF documentation lists the `Q4_K` type at 4.5, because a file also holds metadata, the tokenizer, scale factors and some tensors kept at higher precision. Use file size, not the label, when you plan memory. Quantisation also costs quality; how much depends on the model and the task, so measure it (Module 14).

### Open weights or a hosted API: a checklist

| Question | Open weights push the answer this way when... | How to find out |
|---|---|---|
| **Data privacy** | data must not leave your network or a region you control | write down where prompts and logs may go; check a hosted provider's contract terms against that |
| **Cost at volume** | sustained, predictable, high token volume keeps GPUs busy | Listing 6: break-even depends on utilisation, not on price alone |
| **Latency control** | you need to tune batch size, quantisation, caching, placement, or run offline | measure time to first token and tokens/s on your hardware (Track 14) |
| **Capability** | an evaluated small or mid-size model meets your quality bar on *your* task | run an eval on your own labelled data; never settle it from a leaderboard (Module 14) |
| **Ops burden** | you have people to run, patch, monitor and upgrade a serving stack, and redundancy | count the on-call hours and the second replica; both are cost |
| **Licence** | the exact licence of the exact repo fits your product, scale and redistribution plans | read the `LICENSE` file; involve counsel |

Two things sit between the extremes. Open weights can be *served by someone else* ([Module 13](../13-the-hugging-face-ecosystem/README.md) covers Hugging Face's hosted options), which keeps the licence and model-choice freedom but removes the GPU work. And hosted and self-hosted can coexist behind one interface ([Module 17: Provider Abstraction and Model Routing](../17-provider-abstraction-and-model-routing/README.md)).

> [!pitfall] Comparing a per-token price with a GPU hourly rate hides utilisation. A GPU costs the same when idle. At low volume the hosted API usually wins because you pay only for what you use; the crossover is a utilisation figure you can compute (Listing 6), then compare with the traffic you actually have, including your peak-to-average ratio.

## Code

Every listing uses only the Python standard library, and was run on 2026-10-26 with Python 3.13. Listings 1 to 5 call the public Hugging Face Hub (no token, no weight downloads, only JSON and text files); Listing 2 also fetches licence texts from GitHub and apache.org. Their outputs are facts about those repositories on that date and will drift. Listing 6 is a pure calculation with **ILLUSTRATIVE** constants.

### Listing 1: licence field, gating and size from the Hub's public metadata

```python
import json
import urllib.error
import urllib.request

HUB = "https://huggingface.co"


def get(url):
    """Return (HTTP status, body bytes). 401/404 come back as a status, not an exception."""
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


REPOS = [
    "mistralai/Mistral-7B-v0.1",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "Qwen/Qwen2.5-0.5B",
    "Qwen/Qwen2.5-1.5B",
    "Qwen/Qwen2.5-3B",
    "Qwen/Qwen2.5-7B",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-14B",
    "Qwen/Qwen2.5-32B",
    "Qwen/Qwen2.5-72B",
    "meta-llama/Llama-3.1-8B",       # gated: expect 401 on config.json
    "meta-llama/Meta-Llama-3-8B",    # gated
]

print(f"{'repo':36} {'gated':7} {'licence field':22} {'config.json':>11} {'safetensors params':>19} {'main sha':>10}")
for repo in REPOS:
    status, body = get(f"{HUB}/api/models/{repo}")        # public metadata, even for gated repos
    meta = json.loads(body)
    card = meta.get("cardData", {})
    lic = card.get("license", "?")
    if card.get("license_name"):
        lic += "/" + card["license_name"]                   # license: other + license_name: <name>
    cfg_status, _ = get(f"{HUB}/{repo}/raw/main/config.json")
    total = meta.get("safetensors", {}).get("total")
    print(f"{repo:36} {str(meta['gated']):7} {lic:22} {cfg_status:>11} {total:>19,} {meta['sha'][:10]:>10}")
```

Output (executed 2026-10-26):

```text
repo                                 gated   licence field          config.json  safetensors params   main sha
mistralai/Mistral-7B-v0.1            False   apache-2.0                     200       7,241,732,096 27d67f1b5f
mistralai/Mistral-7B-Instruct-v0.3   False   apache-2.0                     200       7,248,023,552 c170c708c4
Qwen/Qwen2.5-0.5B                    False   apache-2.0                     200         494,032,768 060db6499f
Qwen/Qwen2.5-1.5B                    False   apache-2.0                     200       1,543,714,304 8faed761d4
Qwen/Qwen2.5-3B                      False   other/qwen-research            200       3,085,938,688 3aab1f1954
Qwen/Qwen2.5-7B                      False   apache-2.0                     200       7,615,616,512 d149729398
Qwen/Qwen2.5-7B-Instruct             False   apache-2.0                     200       7,615,616,512 a09a35458c
Qwen/Qwen2.5-14B                     False   apache-2.0                     200      14,770,033,664 97e1e76335
Qwen/Qwen2.5-32B                     False   apache-2.0                     200      32,763,876,352 1818d35814
Qwen/Qwen2.5-72B                     False   other/qwen                     200      72,706,203,648 efba10c8e5
meta-llama/Llama-3.1-8B              manual  llama3.1                       401       8,030,261,248 d04e592bb4
meta-llama/Meta-Llama-3-8B           manual  llama3                         401       8,030,261,248 8cde5ca838
```

The two Llama repos show `gated manual` and `401` on `config.json`: the metadata endpoint is public but the files are not. The Qwen2.5 3B and 72B rows show how one family carries different licences: `other/qwen-research` and `other/qwen`. The commit hash in the last column is the revision this table describes; Module 13 shows how to pin it.

### Listing 2: fetch the licence texts and compare them

This is keyword triage over nine real licence texts (the six Llama releases from Meta's GitHub repository, the Qwen text from the 72B repo, the Qwen RESEARCH text from the 3B repo, and Apache-2.0 from apache.org). It runs the nine downloads in parallel because GitHub's raw host was slow from the machine used here.

```python
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

GH = "https://raw.githubusercontent.com/meta-llama/llama-models/main/models"
SOURCES = [
    ("Llama 2",            f"{GH}/llama2/LICENSE"),
    ("Llama 3",            f"{GH}/llama3/LICENSE"),
    ("Llama 3.1",          f"{GH}/llama3_1/LICENSE"),
    ("Llama 3.2",          f"{GH}/llama3_2/LICENSE"),
    ("Llama 3.3",          f"{GH}/llama3_3/LICENSE"),
    ("Llama 4",            f"{GH}/llama4/LICENSE"),
    ("Qwen (72B repo)",    "https://huggingface.co/Qwen/Qwen2.5-72B/raw/main/LICENSE"),
    ("Qwen RESEARCH (3B)", "https://huggingface.co/Qwen/Qwen2.5-3B/raw/main/LICENSE"),
    ("Apache-2.0",         "https://www.apache.org/licenses/LICENSE-2.0.txt"),
]


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8")
    text = text.replace("“", '"').replace("”", '"').replace("’", "'")
    return re.sub(r"\s+", " ", text)        # licence files wrap lines differently: compare on one line


def first(pattern, text):
    m = re.search(pattern, text, re.I)
    return m.group(1).strip() if m else "-"


def has(pattern, text):
    return "yes" if re.search(pattern, text, re.I) else "-"


COLUMNS = [                                   # (header, width, extractor)
    ("date",        19, lambda t: first(r"Date: ([A-Za-z]+ \d+, \d{4})", t) if "Date:" in t else first(r"Version 2\.0, (\w+ \d{4})", t)),
    ("users",       13, lambda t: first(r"(?:greater|more) than ([\d,]+ (?:million )?)monthly active users", t)),
    ("attribution", 24, lambda t: first(r'prominently display "([^"]+)"', t)),
    ("no-train",    10, lambda t: has(r"to improve any other large language model", t)),
    ("non-comm",    10, lambda t: has(r"FOR NON-COMMERCIAL PURPOSES ONLY", t)),
    ("AUP",          5, lambda t: has(r"Acceptable Use Policy", t)),
    ("patent",       7, lambda t: has(r"Grant of Patent License", t)),
]

with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:     # GitHub's raw host can be slow: fetch in parallel
    texts = list(pool.map(lambda s: fetch_text(s[1]), SOURCES))

print(f"{'document':20}" + "".join(f"{h:<{w}}" for h, w, _ in COLUMNS))
for (label, _), text in zip(SOURCES, texts):
    print(f"{label:20}" + "".join(f"{f(text):<{w}}" for _, w, f in COLUMNS))
```

Output (executed 2026-10-26):

```text
document            date               users        attribution             no-train  non-comm  AUP  patent
Llama 2             July 18, 2023      700 million  -                       yes       -         yes  -
Llama 3             April 18, 2024     700 million  Built with Meta Llama 3 yes       -         yes  -
Llama 3.1           July 23, 2024      700 million  Built with Llama        -         -         yes  -
Llama 3.2           September 25, 2024 700 million  Built with Llama        -         -         yes  -
Llama 3.3           December 6, 2024   700 million  Built with Llama        -         -         yes  -
Llama 4             April 5, 2025      700 million  Built with Llama        -         -         yes  -
Qwen (72B repo)     September 19, 2024 100 million  Built with Qwen         -         -         -    -
Qwen RESEARCH (3B)  September 19, 2024 -            Built with Qwen         -         yes       -    -
Apache-2.0          January 2004       -            -                       -         -         -    yes
```

Columns: `date` is the version date line of the text; `users` is the monthly-active-user threshold in the "additional commercial terms" clause; `attribution` is the string you must display; `no-train` flags the clause against using outputs to improve other large language models; `non-comm` flags a non-commercial-only grant; `AUP` flags an acceptable-use policy incorporated by reference; `patent` flags an express patent grant.

Read it with the text open next to it. Llama 2 and Llama 3 contain the clause about improving other large language models and the later releases do not; the 700-million threshold appears in every Llama release and Qwen's is 100 million; the Qwen RESEARCH text is the only non-commercial grant; only Apache-2.0 has an express patent grant. The Llama 4 text labels its date "Version Effective Date" where the earlier ones say "Version Release Date", which is why the regex accepts both. Qwen's attribution clause also offers "Improved using Qwen" for derived models; the table shows only the first string the regex finds.

### Listing 3: from `config.json` to parameters and memory

```python
import json
import urllib.request

HUB = "https://huggingface.co"
GIB = 1024 ** 3


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def param_count(c):
    """Llama-style decoder (Track 05, module 05): GQA attention, 3-matrix gated MLP, RMSNorm."""
    d, L, V, f = c["hidden_size"], c["num_hidden_layers"], c["vocab_size"], c["intermediate_size"]
    a = c["num_attention_heads"]
    g = c.get("num_key_value_heads", a)            # absent -> multi-head attention
    dh = c.get("head_dim", d // a)
    attn = d * a * dh + 2 * d * g * dh + a * dh * d
    if c.get("attention_bias", c["model_type"] == "qwen2"):   # Qwen2 cards say "Attention QKV bias"
        attn += a * dh + 2 * g * dh
    per_layer = attn + 3 * d * f + 2 * d
    head = 0 if c.get("tie_word_embeddings", False) else V * d
    return L * per_layer + V * d + head + d


def kv_bytes_per_token(c, nbytes=2):
    a = c["num_attention_heads"]
    return 2 * c["num_hidden_layers"] * c.get("num_key_value_heads", a) * c.get("head_dim", c["hidden_size"] // a) * nbytes


REPOS = ["mistralai/Mistral-7B-v0.1", "mistralai/Mistral-7B-Instruct-v0.3",
         "Qwen/Qwen2.5-0.5B", "Qwen/Qwen2.5-7B", "Qwen/Qwen2.5-14B", "Qwen/Qwen2.5-72B"]
configs = {r: (get_json(f"{HUB}/{r}/raw/main/config.json"), get_json(f"{HUB}/api/models/{r}")["safetensors"]["total"])
           for r in REPOS}

# Gated: config.json answers 401. Architecture numbers come from the Llama 3 paper (Table 3, see Track 05
# module 05); vocab_size 128256 is BACK-SOLVED so the total matches the Hub's count: a fit, not a reading.
configs["meta-llama/Llama-3.1-8B (paper + fit)"] = (
    dict(model_type="llama", hidden_size=4096, num_hidden_layers=32, num_attention_heads=32,
         num_key_value_heads=8, intermediate_size=14336, vocab_size=128256, tie_word_embeddings=False),
    get_json(f"{HUB}/api/models/meta-llama/Llama-3.1-8B")["safetensors"]["total"])

print(f"{'repo':40} {'computed':>15} {'Hub total':>15} {'diff':>5} {'bf16 GiB':>9} {'4bit GiB':>9} {'KV KiB/tok':>10} {'KV@32K GiB':>10}")
for repo, (c, hub_total) in configs.items():
    p = param_count(c)
    kv = kv_bytes_per_token(c)
    print(f"{repo:40} {p:>15,} {hub_total:>15,} {p - hub_total:>5} "
          f"{p * 2 / GIB:>9.2f} {p * 0.5 / GIB:>9.2f} {kv / 1024:>10.0f} {kv * 32768 / GIB:>10.2f}")

c, total = configs["Qwen/Qwen2.5-7B"]
non_embedding = total - 2 * c["vocab_size"] * c["hidden_size"]      # drop the input table and the output head
print(f"\nQwen2.5-7B non-embedding parameters: {non_embedding / 1e9:.2f}B (the model card says 6.53B)")

# Cross-check weight memory against the file listing: the shard index records the bytes on disk.
print()
for repo in ["mistralai/Mistral-7B-v0.1", "Qwen/Qwen2.5-7B-Instruct"]:
    index = get_json(f"{HUB}/{repo}/raw/main/model.safetensors.index.json")
    total = get_json(f"{HUB}/api/models/{repo}")["safetensors"]["total"]
    print(f"{repo}: index total_size = {index['metadata']['total_size']:,} bytes, "
          f"2 x parameters = {2 * total:,} bytes")
```

Output (executed 2026-10-26):

```text
repo                                            computed       Hub total  diff  bf16 GiB  4bit GiB KV KiB/tok KV@32K GiB
mistralai/Mistral-7B-v0.1                  7,241,732,096   7,241,732,096     0     13.49      3.37        128       4.00
mistralai/Mistral-7B-Instruct-v0.3         7,248,023,552   7,248,023,552     0     13.50      3.38        128       4.00
Qwen/Qwen2.5-0.5B                            494,032,768     494,032,768     0      0.92      0.23         12       0.38
Qwen/Qwen2.5-7B                            7,615,616,512   7,615,616,512     0     14.19      3.55         56       1.75
Qwen/Qwen2.5-14B                          14,770,033,664  14,770,033,664     0     27.51      6.88        192       6.00
Qwen/Qwen2.5-72B                          72,706,203,648  72,706,203,648     0    135.43     33.86        320      10.00
meta-llama/Llama-3.1-8B (paper + fit)      8,030,261,248   8,030,261,248     0     14.96      3.74        128       4.00

Qwen2.5-7B non-embedding parameters: 6.53B (the model card says 6.53B)

mistralai/Mistral-7B-v0.1: index total_size = 14,483,464,192 bytes, 2 x parameters = 14,483,464,192 bytes
Qwen/Qwen2.5-7B-Instruct: index total_size = 15,231,233,024 bytes, 2 x parameters = 15,231,233,024 bytes
```

Check what this proves. The estimate matches the Hub's own parameter total to the last digit for six real configs (`diff` 0), including the Qwen row that only matches because the formula adds the QKV biases. The Llama row is a *fit*: its `config.json` was gated, the architecture numbers come from the Llama 3 paper (the table in Track 05 Module 05), and `vocab_size` 128256 was chosen so the total matches, so it shows consistency, not independent confirmation. The line after the table shows that the card's "non-embedding 6.53B" is the total minus the input table and the output head, and the last two lines show that the shard index's `total_size` equals exactly two bytes per parameter, which is what `torch_dtype: bfloat16` predicts. The 4-bit column is the ideal 0.5 bytes per parameter; Listing 5 shows real files are larger. The `KV @32K` column assumes full attention (see the sliding-window note above) and a bf16 cache, for one sequence.

### Listing 4: base versus instruct, and two chat templates

```python
import json
import urllib.request

HUB = "https://huggingface.co"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


print("1. What each repo's tokenizer_config.json says")
print(f"{'repo':38} {'chat_template':14} {'bos_token':10} {'eos_token':14}")
for repo in ["mistralai/Mistral-7B-v0.1", "mistralai/Mistral-7B-Instruct-v0.3",
             "Qwen/Qwen2.5-7B", "Qwen/Qwen2.5-7B-Instruct"]:
    tok = get_json(f"{HUB}/{repo}/raw/main/tokenizer_config.json")
    print(f"{repo:38} {'present' if tok.get('chat_template') else 'absent':14} "
          f"{str(tok.get('bos_token')):10} {str(tok.get('eos_token')):14}")


# Hand-written renderers for the simple (no tools) path of the two fetched templates.
# The real source of truth is the template string plus tokenizer.apply_chat_template().
def render_qwen(messages, add_generation_prompt=True):
    first = messages[0]
    out = (f"<|im_start|>system\n{first['content']}<|im_end|>\n" if first["role"] == "system" else
           "<|im_start|>system\nYou are Qwen, created by Alibaba Cloud. You are a helpful assistant.<|im_end|>\n")
    for i, m in enumerate(messages):
        if i == 0 and m["role"] == "system":
            continue                                   # already emitted in the header
        out += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
    return out + ("<|im_start|>assistant\n" if add_generation_prompt else "")


def render_mistral_v03(messages, bos="<s>", eos="</s>"):
    system, turns = None, messages
    if messages[0]["role"] == "system":
        system, turns = messages[0]["content"], messages[1:]
    for i, m in enumerate(turns):
        if (m["role"] == "user") != (i % 2 == 0):
            raise ValueError("roles must alternate user/assistant after an optional system message")
    out = bos
    for i, m in enumerate(turns):
        if m["role"] == "user":
            sys_prefix = system + "\n\n" if (system is not None and i == len(turns) - 1) else ""
            out += "[INST] " + sys_prefix + m["content"] + "[/INST]"
        else:
            out += " " + m["content"].strip() + eos
    return out


chat = [
    {"role": "system", "content": "Answer in one word."},
    {"role": "user", "content": "Capital of France?"},
    {"role": "assistant", "content": "Paris"},
    {"role": "user", "content": "And Italy?"},
]
print("\n2. Same conversation, two templates")
print("Qwen (ChatML-style):", repr(render_qwen(chat)))
print("Mistral v0.3       :", repr(render_mistral_v03(chat)))
try:
    render_mistral_v03([{"role": "user", "content": "a"}, {"role": "user", "content": "b"}])
except ValueError as e:
    print("Mistral template rejects two user turns in a row:", e)
```

Output (executed 2026-10-26):

```text
1. What each repo's tokenizer_config.json says
repo                                   chat_template  bos_token  eos_token
mistralai/Mistral-7B-v0.1              absent         <s>        </s>
mistralai/Mistral-7B-Instruct-v0.3     present        <s>        </s>
Qwen/Qwen2.5-7B                        present        None       <|endoftext|>
Qwen/Qwen2.5-7B-Instruct               present        None       <|im_end|>

2. Same conversation, two templates
Qwen (ChatML-style): '<|im_start|>system\nAnswer in one word.<|im_end|>\n<|im_start|>user\nCapital of France?<|im_end|>\n<|im_start|>assistant\nParis<|im_end|>\n<|im_start|>user\nAnd Italy?<|im_end|>\n<|im_start|>assistant\n'
Mistral v0.3       : '<s>[INST] Capital of France?[/INST] Paris</s>[INST] Answer in one word.\n\nAnd Italy?[/INST]'
Mistral template rejects two user turns in a row: roles must alternate user/assistant after an optional system message
```

The renderers cover only the plain-messages path of each fetched template (no tools). During authoring they were compared with the fetched template strings rendered by Jinja2 (a separate package, not needed to run this listing) on four conversations, with and without a system message and with the generation prompt on and off; all outputs were identical. The real source of truth is always the template in the tokenizer config, applied by the tokenizer. Note the system text in the Mistral output: it appears in front of the last user message, not in its own block.

### Listing 5: find the quantised builds and measure bits per weight

```python
import json
import re
import urllib.request

HUB = "https://huggingface.co"
GIB = 1024 ** 3


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


# 1. Everything the publisher lists under the model's name, split into quantised builds and other variants
found = get_json(f"{HUB}/api/models?author=Qwen&search=Qwen2.5-7B-Instruct&limit=50")
names = sorted(m["id"] for m in found if m["id"] != "Qwen/Qwen2.5-7B-Instruct")
quantised = [n for n in names
             if n.startswith("Qwen/Qwen2.5-7B-Instruct-") and any(tag in n for tag in ("GGUF", "AWQ", "GPTQ"))]
print("Quantised builds of this model, from the publisher:")
for n in quantised:
    print("  ", n)
print("Other repos matching the name (other variants, and their own quantised builds):")
for n in names:
    if n not in quantised:
        print("  ", n)

# 2. What a GGUF repo really weighs: file sizes from the Hub API divided by parameter count
params = get_json(f"{HUB}/api/models/Qwen/Qwen2.5-7B-Instruct")["safetensors"]["total"]
repo = get_json(f"{HUB}/api/models/Qwen/Qwen2.5-7B-Instruct-GGUF?blobs=true")
sizes = {}
for f in repo["siblings"]:
    m = re.match(r"qwen2\.5-7b-instruct-(.+?)(?:-\d{5}-of-\d{5})?\.gguf$", f["rfilename"])
    if m:
        sizes[m.group(1)] = sizes.get(m.group(1), 0) + f["size"]          # sum the shards of one quant

print(f"\nGGUF files for {params:,} parameters")
print(f"{'quant':8} {'bytes':>15} {'GiB':>7} {'bits/weight':>12}")
for quant, nbytes in sorted(sizes.items(), key=lambda kv: kv[1]):
    print(f"{quant:8} {nbytes:>15,} {nbytes / GIB:>7.2f} {nbytes * 8 / params:>12.3f}")
```

Output (executed 2026-10-26):

```text
Quantised builds of this model, from the publisher:
   Qwen/Qwen2.5-7B-Instruct-AWQ
   Qwen/Qwen2.5-7B-Instruct-GGUF
   Qwen/Qwen2.5-7B-Instruct-GPTQ-Int4
   Qwen/Qwen2.5-7B-Instruct-GPTQ-Int8
Other repos matching the name (other variants, and their own quantised builds):
   Qwen/Qwen2.5-7B-Instruct-1M
   Qwen/Qwen2.5-Coder-7B-Instruct
   Qwen/Qwen2.5-Coder-7B-Instruct-AWQ
   Qwen/Qwen2.5-Coder-7B-Instruct-GGUF
   Qwen/Qwen2.5-Coder-7B-Instruct-GPTQ-Int4
   Qwen/Qwen2.5-Coder-7B-Instruct-GPTQ-Int8
   Qwen/Qwen2.5-Math-7B-Instruct
   Qwen/Qwen2.5-VL-7B-Instruct
   Qwen/Qwen2.5-VL-7B-Instruct-AWQ

GGUF files for 7,615,616,512 parameters
quant              bytes     GiB  bits/weight
q2_k       3,015,940,000    2.81        3.168
q3_k_m     3,808,391,072    3.55        4.001
q4_0       4,431,390,848    4.13        4.655
q4_k_m     4,683,073,632    4.36        4.919
q5_0       5,315,176,576    4.95        5.583
q5_k_m     5,444,831,360    5.07        5.720
q6_k       6,254,198,880    5.82        6.570
q8_0       8,098,525,408    7.54        8.507
fp16      15,237,853,536   14.19       16.007
```

Compare with the nominal figures. The Hub's GGUF documentation lists `Q4_K` at 4.5 bits per weight and `Q2_K` at 2.625; the whole-file figures above are higher (4.919 for `q4_k_m`, 3.168 for `q2_k`) because of metadata and mixed precision. The `fp16` file is 16.007 bits per weight for the same reason. For the llama.cpp quantisation table that Track 05 cites for an 8B model (`Q4_K_M` at 4.8944 bits per weight) the pattern is the same.

### Listing 6: break-even between a hosted API and self-hosting (ILLUSTRATIVE)

Every constant here is a placeholder. The shape of the answer is the point: the fixed monthly cost of a GPU plus operations time, divided by whatever volume you actually push through it. See [Track 05 Module 13: Cloud GPU Economics](../../05-gpus-and-genai-hardware/13-cloud-gpu-economics/README.md) for GPU pricing logic.

```python
# ILLUSTRATIVE numbers only: replace every constant with your own quotes and your own measurements.
API_USD_PER_MTOK = 2.00        # blended price per 1M tokens (input+output mix) of a hosted model
GPU_USD_PER_HOUR = 2.00        # rental price of one GPU that can hold the open-weight model
N_GPUS = 1
OPS_USD_PER_MONTH = 500.0      # share of an engineer's time: deploys, upgrades, on-call, monitoring
THROUGHPUT_TPS = 1500          # aggregate generated+prompt tokens/s the serving stack sustains when busy
HOURS_PER_MONTH = 730

selfhost_monthly = N_GPUS * GPU_USD_PER_HOUR * HOURS_PER_MONTH + OPS_USD_PER_MONTH
capacity = THROUGHPUT_TPS * 3600 * HOURS_PER_MONTH            # tokens/month at 100% busy
print(f"self-hosting fixed cost : ${selfhost_monthly:,.0f} per month (GPU rent + ops share)")
print(f"capacity at 100% busy   : {capacity / 1e6:,.0f}M tokens per month")

breakeven = selfhost_monthly / API_USD_PER_MTOK * 1e6         # tokens/month where the two bills are equal
print(f"break-even volume       : {breakeven / 1e6:,.0f}M tokens per month "
      f"= {breakeven / capacity:.0%} of capacity\n")

print(f"{'tokens/month':>13} {'utilisation':>11} {'API bill':>10} {'self-host bill':>15} {'self-host $/1M tok':>19}")
for tokens in (10e6, 100e6, 500e6, 1e9, 2e9, 3.9e9):
    util = tokens / capacity
    api_bill = tokens / 1e6 * API_USD_PER_MTOK
    print(f"{tokens / 1e6:>12,.0f}M {util:>11.1%} ${api_bill:>9,.0f} ${selfhost_monthly:>14,.0f} "
          f"${selfhost_monthly / (tokens / 1e6):>18,.2f}")
```

Output (executed 2026-10-26, constants are illustrative):

```text
self-hosting fixed cost : $1,960 per month (GPU rent + ops share)
capacity at 100% busy   : 3,942M tokens per month
break-even volume       : 980M tokens per month = 25% of capacity

 tokens/month utilisation   API bill  self-host bill  self-host $/1M tok
          10M        0.3% $       20 $         1,960 $            196.00
         100M        2.5% $      200 $         1,960 $             19.60
         500M       12.7% $    1,000 $         1,960 $              3.92
       1,000M       25.4% $    2,000 $         1,960 $              1.96
       2,000M       50.7% $    4,000 $         1,960 $              0.98
       3,900M       98.9% $    7,800 $         1,960 $              0.50
```

With these made-up constants, self-hosting only wins above roughly a quarter of the GPU's capacity, and at 10M tokens a month it costs two orders of magnitude more per token. The calculation leaves out a second replica for availability, peak-to-average traffic (you pay for the peak), engineer time beyond the flat share, and the quality difference between the models being compared.

## Visual diagram

What "open" can mean, left to right, and what each step adds:

```
  CAN I DOWNLOAD IT?             WHAT MAY I DO WITH IT?                      CAN I STUDY AND REBUILD IT?
  (open-weight)                  (the licence)                               (OSI Open Source AI Definition 1.0)

  ┌──────────────────────┐       ┌───────────────────────────────────┐       ┌────────────────────────────────┐
  │ weights              │       │ grant of rights, plus conditions: │       │ Data Information: what data,   │
  │ config.json          │       │   - user-count threshold          │       │   where from, how filtered     │
  │ tokenizer + template │  ──►  │   - attribution / naming          │  ──►  │ Code: to train AND to run      │
  │ model card, LICENSE  │       │   - use policy by reference       │       │ Parameters: OSI-approved terms │
  └──────────────────────┘       └───────────────────────────────────┘       └────────────────────────────────┘
  what a Hub repo gives you      differs per family, size, release           weights alone are one of the three
                                 (Listings 1 and 2)                          required pieces
```

From `config.json` to a memory budget (Listing 3):

```
  config.json                    formula (Track 05 Module 05)
  ───────────                    ────────────────────────────
  hidden_size            d ─┐
  num_hidden_layers      L ─┤
  num_attention_heads    a ─┼─► P = L (attn + mlp + norms) + embeddings ─► weights = P x bytes ─────────┐
  intermediate_size      f ─┤      (+ attention biases; separate output head if untied)                 │
  vocab_size             V ─┤                                                                           │
  tie_word_embeddings      ─┘                                                                           │
  num_key_value_heads    g ───────► KV/token = 2 L g d_h bytes ─► x context x users ────────────────────┤─► total: must fit the GPU / unified memory
  sliding_window, dtype    ───────► (they cap, and set the bytes of, the line above)                    │
                                    overhead ≈ 20% of weights (a guess: measure) ───────────────────────┘
```

Open weights or hosted API:

```
                     must the data stay on your network?
                 yes │                              │ no
                     ▼                              ▼
   open weights: self-hosted         sustained, high, steady volume?
   or a private deployment               yes │              │ no
                     ▲                       ▼              ▼
                     │          price GPU + ops (Listing 6);   hosted API (pay per use),
                     │          do you have a team to run it?  or open weights served
                     │             yes │          │ no        by a provider (Module 13)
                     └─────────────────┘          └─► hosted API or a provider

   in every branch: read the LICENSE of the exact repo; evaluate quality on YOUR task (Module 14)
```

## Practice

### 1. Read a licence

The Qwen2.5-3B repo declares `license: other` with `license_name: qwen-research`. Your company wants to use it inside a paid product. Using the Qwen RESEARCH text quoted above, what does the licence grant, what does it say about commercial use, and what are your options? (Not legal advice.)

<details><summary>Answer</summary>

The grant is "FOR NON-COMMERCIAL PURPOSES ONLY", and the text defines "Non-Commercial" as "for research or evaluation purposes only"; it adds "If you are commercially using the Materials, you shall request a license from us." So a paid product is outside the grant as written. Options: ask the licensor for a commercial licence; choose a different size or family whose own repo and `LICENSE` file permit your use (at fetch time the 7B repo declares `apache-2.0`, but you must confirm the file in the exact repo and revision you ship); or use it only for research or evaluation. Involve counsel before relying on any of these.

</details>

### 2. Does it fit? Size a 32B model for one 24 GiB card

Fetch `Qwen/Qwen2.5-32B`'s `config.json` (or reuse the numbers: 64 layers, hidden 5120, 40 query heads, 8 KV heads, MLP 27648, vocabulary 152064) and use Listing 3's functions. Will 4-bit weights plus one 8,192-token bf16 KV cache plus 20% of the weights as overhead fit in 24 GiB? Do it twice: with the ideal 4 bits per weight and with the 4.919 bits per weight Listing 5 measured for a `q4_k_m` file.

<details><summary>Answer</summary>

Parameters 32,763,876,352; KV cache 262,144 bytes (256 KiB) per token, so 2.00 GiB at 8,192 tokens. Ideal 4-bit: weights 15.26 GiB + KV 2.00 + overhead 3.05 = **20.31 GiB**, which fits. At 4.919 bits per weight: weights 18.76 + KV 2.00 + overhead 3.75 = **24.51 GiB**, which does not. The lesson is the margin: the answer flips on the bits-per-weight assumption and on a 20% overhead guess, so measure with the real file before buying hardware. (Computed with Listing 3's `param_count` and `kv_bytes_per_token`.)

</details>

### 3. Read a config with missing keys

A repo's `config.json` has `model_type: "llama"`, `hidden_size` 2048, `num_attention_heads` 16, `num_hidden_layers` 24, `intermediate_size` 5504, `vocab_size` 32000, no `num_key_value_heads`, no `head_dim`, and no `tie_word_embeddings`. How many parameters, how many GiB in bf16, and what is the KV cache per token?

<details><summary>Answer</summary>

Missing `num_key_value_heads` means plain multi-head attention, so `g = a = 16`; head size is 2048 / 16 = 128; missing `tie_word_embeddings` is read as false (untied). Listing 3's `param_count` gives **1,345,423,360** parameters, so 2.51 GiB in bf16. KV cache: `2 x 24 x 16 x 128 x 2` = 196,608 bytes = **192 KiB per token**. Remember the `tie_word_embeddings` default depends on the library version and model class, so confirm against the Hub's reported total if there is one.

</details>

### 4. Move the break-even

In Listing 6, halve `THROUGHPUT_TPS` to 750 and leave everything else. What is the break-even utilisation now, and what does that say about tuning the serving stack?

<details><summary>Answer</summary>

Capacity halves to about 1,971 million tokens a month while break-even volume stays 980 million, so the break-even utilisation roughly doubles to **49.7%**. Throughput per GPU (batching, quantisation, a better serving engine) moves the break-even as much as the price does, which is why Track 14 matters for the cost case.

</details>

### Checkpoint quiz

1. What are the three components the OSI Open Source AI Definition lists as the "preferred form to make modifications", and which one does an open-weight release always provide?
2. Name three kinds of conditions to look for in a model licence, with one example of each from the texts quoted above.
3. Why does the Qwen2.5 family illustrate "per size" licensing?
4. Why can a repo's `config.json` return `401` while the Hub's `/api/models/<id>` endpoint returns the licence name?
5. Which `config.json` keys set the KV-cache bytes per token, and which three knobs do you control at serving time that scale the total?
6. Two files in a repo both say they hold "the weights"; one is `.safetensors` and one is `.bin`. What should you check before choosing?

<details><summary>Answers</summary>

1. Data Information, Code, Parameters (weights). The weights/parameters.
2. Who and how much: a monthly-active-user threshold (700 million in the Llama texts, 100 million in the Qwen text) or a non-commercial grant (Qwen RESEARCH). What you must do: pass on a copy of the licence, display "Built with Llama", prefix a derived model's name with "Llama". What you must not do: the Llama 2 and 3 clause against using outputs to improve other large language models; the acceptable-use policy incorporated by reference.
3. In the metadata fetched, the 0.5B, 1.5B, 7B, 14B and 32B repos declare Apache-2.0, the 3B declares the Qwen RESEARCH licence and the 72B declares the Qwen licence, so the family name does not determine the licence.
4. Gated repos restrict file access to approved users, but the Hub's metadata API is public; Listing 1 shows `gated: manual`, `401` for the config and a licence name in the metadata.
5. `num_hidden_layers`, `num_key_value_heads` and the head size (`head_dim`, or `hidden_size / num_attention_heads`) set the bytes per token. At serving time you control context length, the number of simultaneous sequences and the cache precision.
6. Whether the `.bin` is pickle-based (it can execute code when loaded; Module 13), whether the two hold identical weights (the shard index and file sizes), and which one your serving stack loads. Prefer safetensors.

</details>

> [!check]
> - I can explain the difference between open-weight and the OSI definition of open source AI
> - I can find the licence of an exact repo and name its conditions without claiming legal advice
> - I can read a model card and a config.json and notice where they disagree
> - I can estimate parameters, weight memory and KV cache from a config and check the result against the Hub
> - I can tell a base model from an instruct model, and say which token ends an assistant turn
> - I can run a break-even calculation and say why utilisation drives it

## Project

Write `audit.py`, a small command-line tool: `python audit.py <repo_id> [--context N] [--gpu-gib G]`. Using only the standard library and the Hub's public files, it prints a one-screen report for any model repo: licence field and `license_name`, whether a `LICENSE` file is listed, whether the repo is gated (and, if so, which parts of the report it could not produce, instead of crashing), the commit hash it audited, a parameter count computed from `config.json` beside the Hub's reported total (flag a difference above 1% and say which assumption probably failed: biases, tied embeddings, mixture-of-experts keys, an explicit `head_dim`), weight memory at bf16/int8/4-bit, KV cache for the context you pass, whether the tokenizer config has a chat template and what its `eos_token` is, whether the config has `auto_map` (ships code), and the publisher's quantised repos if any. Exit with a non-zero status when anything blocks use (gated and unreadable, no licence information, or a size mismatch you cannot explain).

Run it on at least one Apache-2.0 model, one model with a custom licence, and one gated model, and write down what each run could and could not tell you. There is no reference solution.

## Interview questions

> [!interview] Your legal team asks whether the company can ship an open-weight model inside its product. How do you get them what they need?

<details><summary>What a strong answer covers</summary>

Do not answer from the model's reputation or a blog post. Name the exact repo and revision, hand over the `LICENSE` file (and the acceptable-use policy it incorporates, if any), and point at the operative parts: the grant and its limits (non-commercial or not), scale thresholds, what must accompany redistribution (a licence copy, an attribution string, a naming rule), restrictions on using outputs to train other models, termination and governing-law clauses. Note that licences differ per size and release, that fine-tunes and quantised conversions are derivatives with their own cards, and that gated access can be revoked, so keep a mirror with the licence text. State plainly that engineering can triage but counsel decides.

</details>

> [!interview] You are asked whether a 7B-class open-weight model can serve 8 concurrent 32K-context users on one 24 GiB GPU. Walk through your estimate and what you would verify.

<details><summary>What a strong answer covers</summary>

Read `config.json`: layers, KV heads, head size, parameter count (check it against the Hub's reported total). Weights: for a 7.6B model, 14.19 GiB in bf16 and roughly 4 to 5 GiB at 4-bit depending on the real file size, not the nominal label. KV cache: bytes per token (for a 28-layer, 4-KV-head, head size 128 model, 56 KiB) times 32,768 tokens times 8 users is 14 GiB in bf16, so the cache dominates; mention cache quantisation, a shorter context, or fewer users. Add overhead and say it is a guess. Conclude: in bf16 it needs about 14.19 x 1.2 + 14 = 31 GiB, which does not fit; with a roughly 4.4 GiB 4-bit file it is about 4.4 x 1.2 + 14 = 19 GiB, which fits with a thin margin if the stack really stores a bf16 cache for all eight sequences (a quantised cache or a shorter context buys more room). Say you would measure peak memory with the real serving stack, and check that the stack implements any sliding-window or GQA saving the formula assumes.

</details>

> [!interview] When would you choose open weights over a hosted API, and when would you not?

<details><summary>What a strong answer covers</summary>

Use the six-point checklist rather than a slogan: data residency and privacy, cost at the volume you actually have (a utilisation-driven break-even, with ops time and redundancy counted), latency and control, measured capability on your own labelled task, ops burden, and licence fit. Say that low or spiky volume and no ops capacity favour a hosted API, that sustained volume, data constraints or the need to tune favour open weights, and that there are middle paths (open weights served by a provider, or both behind one interface with routing). A strong answer insists on measuring quality on the real task before deciding and does not rank models from leaderboards.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `401` fetching `config.json` or a weight file | the repo is gated and you are not authenticated or not approved | request access in the browser, authenticate with a token (Module 13); use the public metadata endpoint for licence and size in the meantime |
| `KeyError: 'qwen2'` or `KeyError: 'mistral'` on load | a `transformers` release older than the architecture (the Qwen2.5 card says versions below 4.37.0; the Mistral-7B-v0.1 card says 4.34.0 or newer) | upgrade the library; do not edit the config's `model_type` |
| Generation runs on past the end of an answer | the server stops on a different end token than the model emits (compare the instruct repo's `eos_token` and `generation_config.json`), or you sent a base model a chat format | use the instruct repo's own template and end tokens |
| Output quality drops for no visible reason | hand-formatted prompt, or a template from a different model | render with the tokenizer's own template (Listing 4) |
| Estimated parameter count is off by a small amount | attention biases, tied embeddings, or an explicit `head_dim` | compare per component; Listing 3 handles all three |
| Estimated parameter count is off by a large amount | a mixture-of-experts model, or a non-Llama block design | MoE needs all experts counted for memory; read the card's architecture list |
| The model fits on paper and runs out of memory in practice | the KV cache for the real context and batch, overhead, or a quantised file bigger than `params x bits / 8` | use file sizes (Listing 5) and measure peak memory |
| The card says one context length and the config another | the card describes an extended mode that needs extra config (Qwen's YaRN note) | read the card section on long inputs and test the long-context setup before promising it |
| Licence label says Apache-2.0 but a sibling size does not | licences are per repo | read each repo's `LICENSE`, as in Listings 1 and 2 |

## Further reading & sources

- [The Open Source AI Definition - 1.0](https://opensource.org/ai/open-source-ai-definition) - the OSI text quoted above; the reference for what "open source" would require of a model beyond its weights.
- [The Open Source Definition](https://opensource.org/osd) - the ten criteria for software licences, including the no-discrimination criteria 5 and 6 that make model licences with user thresholds or use policies worth reading against.
- [Llama 3.1 Community License Agreement](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/LICENSE) - the Llama text quoted in this module; the same repository holds every other release's licence for comparison.
- [Qwen LICENSE AGREEMENT](https://huggingface.co/Qwen/Qwen2.5-72B/blob/main/LICENSE) - the Qwen licence text with the 100-million-user clause, as shipped in a repo.
- [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0) - the licence declared by the Mistral 7B repos and several Qwen2.5 sizes; the baseline to compare custom licences against.
- [Hugging Face Hub: Model Cards](https://huggingface.co/docs/hub/model-cards) - what a card should contain and how its YAML metadata (`license`, `base_model`, `library_name`) works.
- [Qwen2.5 Technical Report](https://arxiv.org/abs/2412.15115) - the primary description of the Qwen2.5 family used for the size ladder here; its abstract states the base, instruct and quantised open-weight offerings.
- [Hugging Face Hub: GGUF](https://huggingface.co/docs/hub/gguf) - the Hub's documentation of GGUF files, the quantisation types and their nominal bits per weight, and the filter for finding GGUF repos.

## Next

[Module 13: The Hugging Face Ecosystem](../13-the-hugging-face-ecosystem/README.md)
