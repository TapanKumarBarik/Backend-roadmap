# Module 13: The Hugging Face Ecosystem

## Roadmap

**Where this sits.** [Module 12: Open-Weight Models: Llama, Mistral, Qwen](../12-open-weight-models-llama-mistral-qwen/README.md) showed what is inside a model repository and how to read its licence, card and `config.json`. This module is the machinery around those repositories: the Hugging Face Hub that hosts them, how to fetch a specific version safely, how access control and the local cache work, why a model can run code on your machine, the safetensors file format that makes loading weights safe, a map of the Python libraries in the ecosystem, and the hosted-inference options. Next, [Module 14: Small Language Models (SLMs)](../14-small-language-models/README.md) uses this ecosystem to pick and evaluate a small model.

**Prerequisites.** Module 12; Python and `struct`/`json` basics. The libraries are shown but not run (no installs in this module); the file format is implemented from scratch and run.

**After this module you can:**

- Explain the Hub as git repositories for models, datasets and Spaces, and pin an exact commit instead of a moving branch.
- Handle gated models and access tokens without leaking credentials, and say where the cache lives and how to move it.
- Decide when `trust_remote_code=True` is acceptable, and preflight a repo to see whether it even asks for that.
- Write a safetensors file and a validating parser with only the standard library and numpy, verify a bit-exact round trip, and read a real model's tensor list without downloading its weights.
- Explain, from the documentation's own security rationale, why pickle-based checkpoints were replaced.
- Place `transformers`, `tokenizers`, `datasets`, `huggingface_hub`, `accelerate`, `peft` and `trl` on a map, and describe what the hosted inference options are.

**Why it matters.** Most open-weight work starts with `from_pretrained("org/name")`. That one line downloads files from a third party, may execute their code, and silently follows whatever the repository's `main` branch currently says. Knowing what it does is the difference between a reproducible, defensible system and one that changes under you.

**Date stamp.** Documentation pages and Hub metadata were fetched on 2026-10-26. APIs, defaults and prices change; the linked documentation is the source of truth, and the library calls in Listing 7 are labelled NOT EXECUTED because they need packages, network access and sometimes a token or a GPU that this module's verification did not use (names and parameters were checked against the fetched docs).

## Concept

> [!key] The Hub is a git host for models, datasets and Spaces, so every file you load comes from a *revision*; pin the full commit hash, not a branch. Loading can run someone else's code in two ways, a pickle-based weights file and `trust_remote_code`, which is why weights are shipped as safetensors: an 8-byte length, a JSON header and raw bytes, parseable without executing anything.

## Explanation

### The Hub: three kinds of repository

The Hub documentation states: "Models, Spaces, and Datasets are hosted on the Hugging Face Hub as Git repositories, which means that version control and collaboration are core elements of the Hub." The repositories are "optimized for Machine Learning and AI files", meaning large binary files, usually in formats like Parquet and Safetensors, and use a storage backend called Xet for chunk-level deduplication. Listing 1 queries one of each kind through the same API shape:

- A **model** repo holds weights, config, tokenizer files and a card (Module 12).
- A **dataset** repo "is a Git repository that contains the data required to generate splits for training, evaluation, and testing", usually Parquet files plus a dataset card.
- A **Space** stores an app: "Under the hood, Spaces stores your code inside a git repository", with SDK options of Gradio, Docker or static HTML. Each new commit rebuilds and restarts the app. A Space is how a demo is hosted; it is not a production serving tier.

Because they are git repositories you can browse files, read history, open pull requests and discussions, and fetch any file at any commit.

### Revisions: pin the commit

A **revision** is a git reference: a branch name, a tag, a pull-request ref such as `refs/pr/3`, or a commit hash. The `huggingface_hub` documentation says `hf_hub_download(..., revision=...)` takes any of these, and adds: "When using the commit hash, it must be the full-length hash instead of a 7-character commit hash." In `transformers`, `revision` "can be a branch name, a tag name, or a commit id, since we use a git-based system for storing models and other artifacts on huggingface.co, so revision can be any identifier allowed by git"; it defaults to `"main"`.

> [!model] A branch is a label that moves; a commit hash is a name that cannot. `main` means "whatever the owner last pushed". A pinned 40-character hash means "exactly these bytes, as of that moment", the same on your laptop, in CI and in production next month. Pinning turns a model download from a dependency on a person into a dependency on a file.

Listing 1 shows it on `mistralai/Mistral-7B-v0.1`: two branches, each pointing at a commit, and the `config.json` fetched through `main` and through the pinned hash have the same checksum *today*. The point is not that they differ now; it is that only one of them is allowed to differ tomorrow. Weights are the larger worry: a repository owner (or someone who compromises their account) can replace files on `main`, and a re-deploy then silently ships different weights. Pin, record the hash next to the licence you read (Module 12), and upgrade deliberately after re-running your evaluation.

### Gated models and access tokens

A **gated** model requires an access request: per the Hub documentation, "users must submit an access request to access the model files, which shares their Hugging Face information (username and email address) with the model authors". Approval is automatic or manual, and "the model authors have complete control over model access. In particular, they can decide at any time to block your access to the model without prior notice". Scripts must authenticate: "To download files from a gated model you'll need to be authenticated ... you will need to provide a user token." Without it, file requests answer `401` (Module 12, Listing 1) while the repository's public metadata stays readable.

User access tokens come in roles: **fine-grained** ("access to specific resources, such as a specific model or models in a specific organization"), **read**, and **write**. The documentation's recommendations: create one token per app or usage so you can revoke one without breaking the others; use only fine-grained tokens in production; and "Try not to leak your token". A token authenticates the `huggingface_hub` library through `hf auth login`, `login()`, the `HF_TOKEN` environment variable or a `token=` argument. Put it in the environment, never in code or a repository. If one leaks, delete or refresh it from the settings page.

### The cache

`huggingface_hub` keeps downloaded files in a shared local cache so that each file is fetched once. Per the cache guide and the environment-variable reference, the default location is `~/.cache/huggingface/hub` (`HF_HOME` "Defaults to `~/.cache/huggingface` unless `XDG_CACHE_HOME` is set"; `HF_HUB_CACHE` defaults to `$HF_HOME/hub` and overrides it), and each repo gets a folder named `models--org--name` (or `datasets--...`, `spaces--...`) with `blobs/` (content-addressed files), `refs/` (which commit each branch pointed to), `snapshots/<commit>/` (symlinks into `blobs/`, one folder per revision you fetched) and `trees/`. Two revisions that share a file share one blob. Practical consequences:

- Model caches are large (a 7B model is about 14 GiB in bf16, Module 12), so point `HF_HOME` or `HF_HUB_CACHE` at a disk with space, and do it in CI and containers explicitly.
- `HF_HUB_OFFLINE=1` makes the library use only cached files, useful in production and in tests.
- `hf cache ls`, `scan_cache_dir()` and `hf cache verify` (checks cached files against the Hub's checksums) are the documented ways to inspect and check it.
- On Windows the cache relies on symlinks; the environment-variable reference says to enable developer mode or run as administrator, or set `HF_HUB_DISABLE_SYMLINKS=1` at the cost of disk-space deduplication.

### `trust_remote_code`: code execution by design

Not every architecture is built into `transformers`. A repository can ship its own Python modelling files and list them in `config.json` under `auto_map`. Loading such a repo needs `trust_remote_code=True`, and the documentation is blunt about what that means: "Whether or not to allow for custom models defined on the Hub in their own modeling files. This option should only be set to True for repositories you trust and in which you have read the code, as it will execute code present on the Hub on your local machine." The default is `False`.

Treat `trust_remote_code=True` like `pip install` of an unreviewed package plus running it with your credentials, because that is what it is. Before you ever set it: (1) preflight the repo (Listing 5 reports `auto_map` and the `.py` files it ships); (2) read those files; (3) pin the revision so the code you read is the code that runs; (4) prefer a model whose architecture is natively supported, which needs no remote code; (5) if you must run it, do so in an isolated environment without secrets. The same logic covers the remote code's own imports and any `pip` installs its README tells you to run.

### safetensors, and why pickle had to go

PyTorch's default weight format is built on Python's `pickle`, and the Hub's pickle-scanning documentation puts the problem plainly: "Pickle is a widely used serialization format in ML. Most notably, it is the default format for PyTorch model weights. There are dangerous arbitrary code execution attacks that can be perpetrated when you load a pickle file." A pickle is "a stack of instructions or opcodes", and three behaviours make loading unsafe: "when importing a python module, arbitrary code can be executed; you can import builtin functions like `eval` or `exec`, which can be used to execute arbitrary code; when instantiating an object, the constructor may be called". The documentation's advice is "do not unpickle data from untrusted sources", and its scanner can only list the imports in a pickle and highlight suspicious ones, with the disclaimer that "this is not 100% foolproof". Listing 5 reproduces the mechanism with a harmless `print`.

The safetensors project states its purpose directly: "The main rationale for this crate is to remove the need to use `pickle` on `PyTorch` which is used by default." The format is deliberately boring. From the specification in the project README (fetched 2026-10-26):

- 8 bytes: `N`, an unsigned little-endian 64-bit integer, the size of the header.
- `N` bytes: a JSON UTF-8 header, "a dict like `{"TENSOR_NAME": {"dtype": "F16", "shape": [1, 16, 256], "data_offsets": [BEGIN, END]}, ...}`". The offsets "point to the tensor data relative to the beginning of the byte buffer (i.e. not an absolute position in the file)", with `END` one past the last byte. The header "MAY be trailing padded with whitespace (0x20)". A special `__metadata__` key holds a string-to-string map, and duplicate keys are disallowed.
- The rest of the file: the byte buffer. "The byte buffer needs to be entirely indexed, and cannot contain holes. This prevents the creation of polyglot files." Little-endian, row-major, no striding. Empty tensors (a dimension of 0) and rank-0 scalars are allowed. "Tensor values are not checked against, in particular NaN and +/-Inf could be in the file."
- The reference reader caps the header at 100,000,000 bytes ("to prevent parsing extremely large JSON") and guarantees tensor addresses do not overlap.

Nothing in that layout can name a function to call. A reader parses JSON, checks arithmetic, and slices bytes, so a hostile file can only be rejected, never executed. Hence the README's definition of "safe": "Can I use a file randomly downloaded and expect not to run arbitrary code?" The same layout gives **lazy loading** (read the header, then only the tensors you need, which Listing 4 uses to inspect a 988 MB file by fetching 32 KB) and **zero-copy** reads (a tensor is a view over a byte range).

> [!pitfall] Safe to *load* is not safe to *trust*. safetensors removes code execution during loading. It does not tell you the weights are the ones the author intended, that they have no backdoor, or that the tokenizer files and any `auto_map` code are harmless. It has no checksum either: Exercise 2 flips a data byte and the file still parses. Integrity comes from pinning a commit and verifying hashes (`hf cache verify`, or the `sha256` the Hub API lists for large files).

In `transformers`, `from_pretrained` has a `use_safetensors` argument documented as "Whether or not to use safetensors checkpoints. Defaults to None. If not specified and safetensors is not installed, it will be set to False", and a `weights_only` argument that defaults to `True` and restricts the unpickler "to loading only tensors, primitive types, dictionaries and any types added via `torch.serialization.add_safe_globals()`". Pass `use_safetensors=True` when you want a hard refusal of pickle-based files. A repo may carry both formats: Module 12 noted `mistralai/Mistral-7B-v0.1` ships `.safetensors` and legacy `pytorch_model-*.bin` copies side by side.

### A map of the libraries

Descriptions are condensed from each library's documentation index (fetched 2026-10-26):

| Library | What the docs say it is | Where this course uses it |
|---|---|---|
| `huggingface_hub` | the client for the Hub: download files and whole repos, upload, manage repos and discussions, run inference; provides `hf_hub_download`, `snapshot_download`, `login`, `InferenceClient`, the cache tools | this module |
| `transformers` | "the model-definition framework for ... machine learning models in text, computer vision, audio, video, and multimodal models, for both inference and training"; `Pipeline`, `Trainer`, `generate` | loading and running models; chat templates ([Track 01 Module 10](../../01-tokens-and-language-modeling/10-chat-templates-and-message-formatting/README.md)) |
| `tokenizers` | "an implementation of today's most used tokenizers, with a focus on performance and versatility", Rust-backed, also used inside `transformers` | [Track 01](../../01-tokens-and-language-modeling/README.md) |
| `datasets` | "a library for easily accessing and sharing AI datasets"; Apache Arrow-backed, with streaming | data for fine-tuning and evaluation |
| `accelerate` | "enables the same PyTorch code to be run across any distributed configuration" with a few added lines (`Accelerator`, `prepare`, `backward`) | the parallelism ideas in [Track 05](../../05-gpus-and-genai-hardware/README.md) |
| `peft` | "efficiently adapting large pretrained models ... without fine-tuning all of a model's parameters" | LoRA and QLoRA, [Track 04 Modules 12 to 14](../../04-training-fine-tuning-and-alignment/12-lora-low-rank-adaptation/README.md) |
| `trl` | "a full stack library where we provide a set of tools to train transformer language models with methods like Supervised Fine-Tuning (SFT), Group Relative Policy Optimization (GRPO), Direct Preference Optimization (DPO), Reward Modeling, and more" | SFT and preference methods, [Track 04](../../04-training-fine-tuning-and-alignment/README.md); its docs index also lists a `DistillationTrainer` under "Knowledge distillation", relevant to Module 14 |
| `safetensors` | the weight format and its reference implementation (Rust, with Python bindings) | this module |

### Hosted inference options

The Hub documentation describes several ways to use a model without running a GPU yourself. As documented on 2026-10-26 (check the pages before relying on any detail; model availability, providers and prices change):

- **Inference Providers** ("access to hundreds of machine learning models, powered by world-class inference providers") offer "a single, consistent API" across partner providers. The docs describe an OpenAI-compatible chat-completions endpoint at `https://router.huggingface.co/v1` ("Drop-in replacement for the OpenAI chat completions API"), authenticated with a Hugging Face token that needs the "Make calls to Inference Providers" permission, and an `InferenceClient` in `huggingface_hub`. A suffix on the model id chooses the provider policy: `:fastest` (the default), `:cheapest`, `:preferred`, or a named provider. Billing is "pay-as-you-go, with monthly included credits for PRO users and Team & Enterprise organizations", and the page says there is "no extra markup on provider rates". Listing 6 builds that request without sending it.
- **Inference Endpoints (dedicated)** is "a managed service to deploy your AI model to production", with autoscaling, observability and "integrated support for open-source Inference Engines" such as vLLM and TGI. This is the closest to running your own serving stack ([Track 14](../../14-inference-and-serving-vllm/README.md)) without operating the machines.
- **Spaces** host demos, not production traffic.
- **Run it yourself**: download the weights and serve them (Module 12 for the sizing, Track 14 for the serving).

Hosted does not mean private. A request to Inference Providers goes to a third-party provider chosen by the router, so the privacy question from Module 12's checklist still applies, now with a different set of contracts. And a hosted open-weight model is a different thing from a hosted proprietary one: you can see its card and licence, and, licence permitting, move it to your own hardware later without changing the model.

## Code

Listings 1 to 5 call the public Hub (no token, no weight downloads; Listing 4 downloads 32 KB of a header). Listings 2 and 3 are the safetensors implementation: save Listing 2 as `stlib.py` in a working folder, then run the others from that folder. Listing 7 is NOT EXECUTED. Outputs were produced on 2026-10-26 with Python 3.13 and numpy 2.4; Hub metadata (commit hashes, file counts) can drift.

### Listing 1: repositories and revisions

```python
import hashlib
import json
import re
import urllib.request

HUB = "https://huggingface.co"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# 1. Models, datasets and Spaces are all repositories: same metadata shape, different URL prefix.
print("kind     repo                       files  first files")
for kind, repo in (("models", "Qwen/Qwen2.5-0.5B"), ("datasets", "PolyAI/minds14"), ("spaces", "gradio/hello_world")):
    meta = json.loads(get(f"{HUB}/api/{kind}/{repo}"))
    files = sorted(s["rfilename"] for s in meta["siblings"])
    print(f"{kind:8} {repo:26} {len(files):>5}  {', '.join(files[:3])}")

# 2. A branch is a moving pointer; a commit hash is not.
REPO = "mistralai/Mistral-7B-v0.1"
refs = json.loads(get(f"{HUB}/api/models/{REPO}/refs"))
print(f"\nrefs of {REPO}")
for b in refs["branches"]:
    print(f"  branch {b['name']:32} -> {b['targetCommit']}")
print("  tags:", [t["name"] for t in refs["tags"]] or "none")

sha = next(b["targetCommit"] for b in refs["branches"] if b["name"] == "main")
assert re.fullmatch(r"[0-9a-f]{40}", sha)                  # pin the full 40-character hash
for label, ref in (("main (moves)", "main"), (f"{sha[:12]}... (fixed)", sha)):
    body = get(f"{HUB}/{REPO}/resolve/{ref}/config.json")
    print(f"  config.json at {label:24} sha256 {hashlib.sha256(body).hexdigest()[:16]}...")
```

Output (executed 2026-10-26):

```text
kind     repo                       files  first files
models   Qwen/Qwen2.5-0.5B             10  .gitattributes, LICENSE, README.md
datasets PolyAI/minds14                18  .gitattributes, README.md, all/train-00000-of-00002.parquet
spaces   gradio/hello_world            10  .gitattributes, DESCRIPTION.md, README.md

refs of mistralai/Mistral-7B-v0.1
  branch main                             -> 27d67f1b5f57dc0953326b2601d68371d40ea8da
  branch clarify-transformers-requirement -> 52a221cd280ec96eb9fba558fef86b97bd1c6948
  tags: none
  config.json at main (moves)             sha256 cf25cdf4719f181d...
  config.json at 27d67f1b5f57... (fixed)  sha256 cf25cdf4719f181d...
```

### Listing 2: a safetensors writer and validating parser (`stlib.py`)

This is the specification above as code. The writer sorts tensors by name and pads the header with spaces to an 8-byte boundary; the reference writer orders by dtype first, so the two produce different but equally valid files. It knows a subset of the format's dtypes (the reference list also has FP8 and other types). The parser performs the checks the spec and the reference reader describe: length limit, UTF-8 JSON, duplicate keys rejected, string-only metadata, offsets that tile the buffer with no holes or overlaps, byte counts that match `shape x itemsize`, and a file size that matches the header exactly. numpy has no bfloat16, so `BF16` tensors are carried as their raw 16 bits.

```python
import json
import math
import struct

import numpy as np

# Format (safetensors README, "Format"): 8 bytes little-endian u64 N | N bytes of JSON header | raw tensor bytes.
# Header: {"name": {"dtype": ..., "shape": [...], "data_offsets": [begin, end]}, "__metadata__": {str: str}}.
# data_offsets are relative to the start of the byte buffer (the byte after the header); the buffer has no holes.
# The README says the header must begin with '{', but the reference unit tests also accept JSON whitespace around it;
# this parser follows the tests.
MAX_HEADER = 100_000_000                                # the reference implementation's header size limit
ITEMSIZE = {"F64": 8, "F32": 4, "F16": 2, "BF16": 2, "I64": 8, "I32": 4, "I16": 2, "I8": 1, "U8": 1, "BOOL": 1}
NUMPY = {"F64": "<f8", "F32": "<f4", "F16": "<f2", "BF16": "<u2",    # numpy has no bfloat16: keep the raw bits as uint16
         "I64": "<i8", "I32": "<i4", "I16": "<i2", "I8": "i1", "U8": "u1", "BOOL": "?"}


def write_safetensors(path, tensors, metadata=None):
    """tensors: {name: (safetensors_dtype, numpy_array)}. Sorted by name; the reference writer orders by dtype first."""
    header, chunks, offset = {}, [], 0
    if metadata:
        header["__metadata__"] = {str(k): str(v) for k, v in metadata.items()}
    for name in sorted(tensors):
        dtype, arr = tensors[name]
        data = np.ascontiguousarray(arr, dtype=NUMPY[dtype]).tobytes(order="C")
        assert len(data) == math.prod(arr.shape) * ITEMSIZE[dtype]
        header[name] = {"dtype": dtype, "shape": list(arr.shape), "data_offsets": [offset, offset + len(data)]}
        chunks.append(data)
        offset += len(data)
    blob = json.dumps(header, separators=(",", ":")).encode("utf-8")
    blob += b" " * (-len(blob) % 8)                    # the spec allows trailing spaces; pad to an 8-byte boundary
    with open(path, "wb") as f:
        f.write(struct.pack("<Q", len(blob)))
        f.write(blob)
        for chunk in chunks:
            f.write(chunk)


def _no_duplicates(pairs):
    keys = [k for k, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate keys in header")
    return dict(pairs)


def parse_header(prefix, file_size=None):
    """Validate the first 8 + N bytes of a file. file_size defaults to len(prefix) (a whole file)."""
    file_size = len(prefix) if file_size is None else file_size
    if len(prefix) < 8:
        raise ValueError("file too small to hold a header length")
    (n,) = struct.unpack("<Q", prefix[:8])
    if n > MAX_HEADER:
        raise ValueError(f"header length {n} exceeds the {MAX_HEADER} limit")
    if 8 + n > len(prefix):
        raise ValueError("header length runs past the end of the data")
    header = json.loads(prefix[8:8 + n].decode("utf-8"), object_pairs_hook=_no_duplicates)   # JSON whitespace is fine
    if not isinstance(header, dict):
        raise ValueError("header must be a JSON object")
    metadata = header.pop("__metadata__", {})
    if not all(isinstance(k, str) and isinstance(v, str) for k, v in metadata.items()):
        raise ValueError("__metadata__ must map strings to strings")
    expected = 0                                       # tensors, ordered by offset, must tile the buffer exactly
    for name, info in sorted(header.items(), key=lambda kv: tuple(kv[1]["data_offsets"])):
        begin, end = info["data_offsets"]
        if info["dtype"] not in ITEMSIZE:               # this teaching parser knows a subset of the format's dtypes
            raise ValueError(f"tensor {name!r}: unsupported dtype {info['dtype']!r}")
        if begin != expected or end < begin:
            raise ValueError(f"tensor {name!r}: offsets {begin}..{end} leave a hole or overlap (expected start {expected})")
        if end - begin != math.prod(info["shape"]) * ITEMSIZE[info["dtype"]]:
            raise ValueError(f"tensor {name!r}: {end - begin} bytes does not match shape {info['shape']} of {info['dtype']}")
        expected = end
    if 8 + n + expected != file_size:
        raise ValueError(f"file has {file_size} bytes but header accounts for {8 + n + expected}")
    return header, metadata, 8 + n


def load_safetensors(blob):
    header, metadata, start = parse_header(blob)
    out = {}
    for name, info in header.items():
        begin, end = info["data_offsets"]
        raw = blob[start + begin:start + end]
        out[name] = (info["dtype"], np.frombuffer(raw, dtype=NUMPY[info["dtype"]]).reshape(info["shape"]).copy())
    return out, metadata
```

### Listing 3: write a tiny file, read it back bit-exactly, and attack the parser

```python
import struct

import numpy as np

from stlib import NUMPY, load_safetensors, parse_header, write_safetensors

# ---- write a tiny file ourselves, parse it back, verify bit-exact round trip ----
rng = np.random.default_rng(0)
f32 = rng.standard_normal((3, 2)).astype("<f4")
bf16_bits = (f32.view("<u4") >> 16).astype("<u2")      # bfloat16 = the top 16 bits of a float32 (truncation)
tricky = np.array([np.nan, -0.0, np.inf, 1e-45], dtype="<f4")    # NaN, negative zero, infinity, a subnormal
tensors = {
    "embed.weight": ("F32", f32),
    "block0.attn.q": ("F16", rng.standard_normal((2, 5)).astype("<f2")),
    "block0.mlp.up": ("BF16", bf16_bits),
    "token_ids": ("I64", np.arange(6, dtype="<i8").reshape(2, 3)),
    "mask": ("BOOL", np.array([True, False, True])),
    "scale": ("F32", np.array(0.125, dtype="<f4")),                 # rank-0 tensor
    "empty": ("F32", np.zeros((0, 4), dtype="<f4")),                # allowed by the spec
    "tricky": ("F32", tricky),
}
write_safetensors("tiny.safetensors", tensors, metadata={"format": "np"})
blob = open("tiny.safetensors", "rb").read()

(n,) = struct.unpack("<Q", blob[:8])
print(f"file size {len(blob)} bytes; first 8 bytes {blob[:8].hex(' ')} -> header length N = {n}")
print("header JSON:", blob[8:8 + n].decode().rstrip())
print(f"data buffer starts at byte {8 + n} (a multiple of 8: {(8 + n) % 8 == 0})\n")

loaded, meta = load_safetensors(blob)
assert meta == {"format": "np"}
for name, (dtype, arr) in tensors.items():
    ldtype, larr = loaded[name]
    same = (ldtype == dtype and larr.shape == arr.shape
            and larr.tobytes() == np.ascontiguousarray(arr, dtype=NUMPY[dtype]).tobytes())
    print(f"{name:14} {dtype:5} shape {str(tuple(arr.shape)):8} bit-exact: {same}")
    assert same
print("NaN survived as NaN, -0.0 kept its sign bit:", np.isnan(loaded["tricky"][1][0]), np.signbit(loaded["tricky"][1][1]))

# ---- byte strings from the reference implementation's own unit tests (safetensors/src/tensor.rs) ----
OK_FILE = b'<\x00\x00\x00\x00\x00\x00\x00{"test":{"dtype":"I32","shape":[2,2],"data_offsets":[0,16]}}' + b"\x00" * 16
vectors = [                                            # (label, bytes, reference accepts it?)
    ("valid 2x2 I32 tensor",        OK_FILE, True),
    ("whitespace-padded header",    b"\x06\x00\x00\x00\x00\x00\x00\x00{}\x0D\x20\x09\x0A", True),
    ("leading-padded header",       b"\x06\x00\x00\x00\x00\x00\x00\x00\x09\x0A{}\x0D\x20", True),
    ("zero-sized tensor [2, 0]",    b'<\x00\x00\x00\x00\x00\x00\x00{"test":{"dtype":"I32","shape":[2,0],"data_offsets":[0, 0]}}', True),
    ("extra bytes (polyglot)",      OK_FILE + b"extra_bogus_data_for_polyglot_file", False),
    ("2 data bytes missing",        OK_FILE[:-2], False),
    ("header length 0xFFFFFF0000..", b"<\x00\x00\x00\x00\xff\xff\xff" + OK_FILE[8:], False),
    ("empty file",                  b"", False),
    ("length but no header",        b"<\x00\x00\x00\x00\x00\x00\x00", False),
    ("header is not UTF-8",         b"\x01\x00\x00\x00\x00\x00\x00\x00\xff", False),
    ("header is not JSON",          b"\x01\x00\x00\x00\x00\x00\x00\x00{", False),
    ("shape disagrees with offsets", b'<\x00\x00\x00\x00\x00\x00\x00{"test":{"dtype":"I32","shape":[2,2],"data_offsets":[0, 4]}}', False),
    ("shape product overflows u64", b'O\x00\x00\x00\x00\x00\x00\x00{"test":{"dtype":"I32","shape":[2,18446744073709551614],"data_offsets":[0,16]}}' + b"\x00" * 16, False),
]
agree = 0
for label, data, reference_accepts in vectors:
    try:
        parse_header(data)
        mine = True
    except (ValueError, KeyError):
        mine = False
    agree += mine == reference_accepts
    print(f"{label:30} reference: {'accept' if reference_accepts else 'reject'}  mine: {'accept' if mine else 'reject'}")
print(f"agreement with the reference tests: {agree}/{len(vectors)}")

# ---- two rules from the README that those tests do not exercise ----
print()
header = blob[8:8 + n]
for label, bad in {
    "offsets leave a hole": blob[:8] + header.replace(b'"data_offsets":[0,', b'"data_offsets":[4,', 1) + blob[8 + n:],
    "duplicate key":        blob[:8] + header.replace(b'"empty"', b'"scale"', 1) + blob[8 + n:],
}.items():
    try:
        parse_header(bad)
        print(f"{label:24} ACCEPTED (unexpected)")
    except ValueError as e:
        print(f"{label:24} rejected: {e}")
```

Output (executed 2026-10-26):

```text
file size 679 bytes; first 8 bytes 20 02 00 00 00 00 00 00 -> header length N = 544
header JSON: {"__metadata__":{"format":"np"},"block0.attn.q":{"dtype":"F16","shape":[2,5],"data_offsets":[0,20]},"block0.mlp.up":{"dtype":"BF16","shape":[3,2],"data_offsets":[20,32]},"embed.weight":{"dtype":"F32","shape":[3,2],"data_offsets":[32,56]},"empty":{"dtype":"F32","shape":[0,4],"data_offsets":[56,56]},"mask":{"dtype":"BOOL","shape":[3],"data_offsets":[56,59]},"scale":{"dtype":"F32","shape":[],"data_offsets":[59,63]},"token_ids":{"dtype":"I64","shape":[2,3],"data_offsets":[63,111]},"tricky":{"dtype":"F32","shape":[4],"data_offsets":[111,127]}}
data buffer starts at byte 552 (a multiple of 8: True)

embed.weight   F32   shape (3, 2)   bit-exact: True
block0.attn.q  F16   shape (2, 5)   bit-exact: True
block0.mlp.up  BF16  shape (3, 2)   bit-exact: True
token_ids      I64   shape (2, 3)   bit-exact: True
mask           BOOL  shape (3,)     bit-exact: True
scale          F32   shape ()       bit-exact: True
empty          F32   shape (0, 4)   bit-exact: True
tricky         F32   shape (4,)     bit-exact: True
NaN survived as NaN, -0.0 kept its sign bit: True True
valid 2x2 I32 tensor           reference: accept  mine: accept
whitespace-padded header       reference: accept  mine: accept
leading-padded header          reference: accept  mine: accept
zero-sized tensor [2, 0]       reference: accept  mine: accept
extra bytes (polyglot)         reference: reject  mine: reject
2 data bytes missing           reference: reject  mine: reject
header length 0xFFFFFF0000..   reference: reject  mine: reject
empty file                     reference: reject  mine: reject
length but no header           reference: reject  mine: reject
header is not UTF-8            reference: reject  mine: reject
header is not JSON             reference: reject  mine: reject
shape disagrees with offsets   reference: reject  mine: reject
shape product overflows u64    reference: reject  mine: reject
agreement with the reference tests: 13/13

offsets leave a hole     rejected: tensor 'block0.attn.q': offsets 4..20 leave a hole or overlap (expected start 0)
duplicate key            rejected: duplicate keys in header
```

What this establishes. The round trip is bit-exact for every dtype including `BF16`, a scalar, an empty tensor, and values that `==` cannot compare (NaN, negative zero, infinity, a subnormal), because the comparison is on bytes. The 13 byte strings come from the unit tests in the reference implementation (`safetensors/src/tensor.rs`, fetched 2026-10-26), and the parser agrees with the reference's accept/reject expectation on all 13, including the polyglot-file test ("extra_bogus_data_for_polyglot_file") and the two whitespace-padding tests. One disagreement exists inside the project itself: the README says the header must begin with `{`, while the reference tests accept leading JSON whitespace. This parser follows the tests. This is evidence, not a proof: it is not the reference implementation, and the two final cases are rules from the README that those tests do not cover.

### Listing 4: read a real model's tensor list without downloading its weights

The documented helper for this is `huggingface_hub.get_safetensors_metadata`, which "fetches a safetensors file header"; this listing does the same thing by hand with two HTTP `Range` requests (8 bytes, then the JSON header), against a pinned commit, and validates the header with Listing 2's parser against the real file size.

```python
import json
import re
import urllib.request

from stlib import parse_header

HUB = "https://huggingface.co"
REPO = "Qwen/Qwen2.5-0.5B"
REVISION = "060db6499f32faf8b98477b0a26969ef7d8b9987"      # full commit hash, taken from the repo's refs on 2026-10-26
URL = f"{HUB}/{REPO}/resolve/{REVISION}/model.safetensors"


def fetch_range(url, first, last):
    """HTTP Range request: returns (bytes, total file size from Content-Range)."""
    req = urllib.request.Request(url, headers={"Range": f"bytes={first}-{last}", "User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total = int(re.search(r"/(\d+)$", r.headers["Content-Range"]).group(1))
        return r.read(), total


first8, total = fetch_range(URL, 0, 7)                      # 1. the 8-byte length
n = int.from_bytes(first8, "little")
prefix, _ = fetch_range(URL, 0, 8 + n - 1)                  # 2. the JSON header only
header, metadata, data_start = parse_header(prefix, file_size=total)   # validated against the real file size

print(f"file size {total:,} bytes; header {n:,} bytes; downloaded {8 + n:,} bytes ({(8 + n) / total:.4%} of the file)")
print("metadata:", metadata)
dtypes = {}
n_params = 0
for name, info in header.items():
    count = 1
    for dim in info["shape"]:
        count *= dim
    n_params += count
    dtypes[info["dtype"]] = dtypes.get(info["dtype"], 0) + 1
print(f"{len(header)} tensors, dtypes {dtypes}, {n_params:,} parameters")
for name in ("model.embed_tokens.weight", "model.layers.0.self_attn.q_proj.weight", "model.layers.0.self_attn.q_proj.bias"):
    print(f"  {name:42} {header[name]['dtype']} {header[name]['shape']}")
print("lm_head.weight present:", "lm_head.weight" in header, "(tie_word_embeddings is true in this repo's config.json)")

api = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{HUB}/api/models/{REPO}/revision/{REVISION}", headers={"User-Agent": "course-example"}), timeout=60).read())
print("Hub-reported total for this revision:", f"{api['safetensors']['total']:,}", "| match:", api["safetensors"]["total"] == n_params)
```

Output (executed 2026-10-26; 32,288 bytes downloaded, no weights):

```text
file size 988,097,824 bytes; header 32,280 bytes; downloaded 32,288 bytes (0.0033% of the file)
metadata: {'format': 'pt'}
290 tensors, dtypes {'BF16': 290}, 494,032,768 parameters
  model.embed_tokens.weight                  BF16 [151936, 896]
  model.layers.0.self_attn.q_proj.weight     BF16 [896, 896]
  model.layers.0.self_attn.q_proj.bias       BF16 [896]
lm_head.weight present: False (tie_word_embeddings is true in this repo's config.json)
Hub-reported total for this revision: 494,032,768 | match: True
```

The parser's checks passed on a real 988 MB file (every tensor tiles the buffer, and the header accounts for exactly the file size the server reported). The parameter count from the header equals the Hub's reported total for that revision, and agrees with Module 12's `config.json` arithmetic: this repo ties its input and output embeddings, so there is no `lm_head.weight` tensor.

### Listing 5: what pickle can do, and a preflight for remote code

```python
import pickle
import pickletools


class Innocent:
    """Unpickling calls whatever __reduce__ names. Here it is print(); it could be any importable callable."""
    def __reduce__(self):
        return (print, ("  >>> code ran while the file was being LOADED",))


blob = pickle.dumps(Innocent(), protocol=4)

print("1. Reading the instructions without running them (pickletools.genops):")
strings, imports = [], []
for opcode, arg, _ in pickletools.genops(blob):
    if opcode.name in ("SHORT_BINUNICODE", "BINUNICODE"):
        strings.append(arg)
    if opcode.name == "STACK_GLOBAL":                  # imports <module> <name>: the two strings pushed just before
        imports.append(f"{strings[-2]}.{strings[-1]}")
    if opcode.name in ("STACK_GLOBAL", "GLOBAL", "REDUCE"):
        print(f"   {opcode.name:13} {imports[-1] if opcode.name == 'STACK_GLOBAL' else '(call the imported callable)'}")

print("\n2. Loading it:")
pickle.loads(blob)

print(f"\n3. Imports found without executing anything: {imports}")
print("   The Hub's pickle scan lists imports like this for every pickled file and highlights suspicious ones.")
print("   Swap print for exec or os.system and steps 1 and 2 look exactly the same shape.")
```

Output (executed):

```text
1. Reading the instructions without running them (pickletools.genops):
   STACK_GLOBAL  builtins.print
   REDUCE        (call the imported callable)

2. Loading it:
  >>> code ran while the file was being LOADED

3. Imports found without executing anything: ['builtins.print']
   The Hub's pickle scan lists imports like this for every pickled file and highlights suspicious ones.
   Swap print for exec or os.system and steps 1 and 2 look exactly the same shape.
```

The class's `__reduce__` names `print`; the same mechanism with `exec` or `os.system` is what the Hub documentation describes. The disassembly in step 1 ran no code; step 2 did. Now the remote-code preflight and the cache-path rules:

```python
import json
import urllib.request

HUB = "https://huggingface.co"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "course-example"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


# 1. Before you ever pass trust_remote_code=True: does the repo ship code that would run on your machine?
def remote_code_report(repo):
    config = get_json(f"{HUB}/{repo}/raw/main/config.json")
    files = [s["rfilename"] for s in get_json(f"{HUB}/api/models/{repo}")["siblings"]]
    auto_map = config.get("auto_map", {})
    py_files = sorted(f for f in files if f.endswith(".py"))
    return auto_map, py_files


print("repo                              auto_map entries   python files in the repo")
for repo in ("Qwen/Qwen2.5-0.5B", "mistralai/Mistral-7B-v0.1", "Qwen/Qwen-7B",
             "microsoft/Phi-3-mini-4k-instruct", "tiiuae/falcon-7b"):
    auto_map, py_files = remote_code_report(repo)
    print(f"{repo:33} {len(auto_map):>16}   {', '.join(py_files) or '-'}")


# 2. Where the cache lives (rules from the huggingface_hub environment-variable reference), and how repos are named in it.
def hub_cache_dir(env, home="~"):
    if env.get("HF_HUB_CACHE"):
        return env["HF_HUB_CACHE"]
    hf_home = env.get("HF_HOME") or (env.get("XDG_CACHE_HOME", f"{home}/.cache") + "/huggingface")
    return hf_home + "/hub"


def cache_folder(repo_id, repo_type="model"):
    return f"{repo_type}s--" + repo_id.replace("/", "--")


print()
for env in ({}, {"HF_HOME": "/data/hf"}, {"HF_HOME": "/data/hf", "HF_HUB_CACHE": "/fast/models"}):
    print(f"env {str(env):52} -> {hub_cache_dir(env)}/{cache_folder('Qwen/Qwen2.5-0.5B')}")
print("a dataset:", cache_folder("PolyAI/minds14", "dataset"))
```

Output (executed 2026-10-26):

```text
repo                              auto_map entries   python files in the repo
Qwen/Qwen2.5-0.5B                                0   -
mistralai/Mistral-7B-v0.1                        0   -
Qwen/Qwen-7B                                     2   configuration_qwen.py, cpp_kernels.py, modeling_qwen.py, qwen_generation_utils.py, tokenization_qwen.py
microsoft/Phi-3-mini-4k-instruct                 2   configuration_phi3.py, modeling_phi3.py, sample_finetune.py
tiiuae/falcon-7b                                 6   configuration_falcon.py, modeling_falcon.py

env {}                                                   -> ~/.cache/huggingface/hub/models--Qwen--Qwen2.5-0.5B
env {'HF_HOME': '/data/hf'}                              -> /data/hf/hub/models--Qwen--Qwen2.5-0.5B
env {'HF_HOME': '/data/hf', 'HF_HUB_CACHE': '/fast/models'} -> /fast/models/models--Qwen--Qwen2.5-0.5B
a dataset: datasets--PolyAI--minds14
```

`auto_map` in `config.json` plus `.py` files in the repo is the signature of a repository that asks for `trust_remote_code=True`. It does not prove the code is malicious, and a repo without it can still be wrong in other ways; the point is that the decision becomes visible before you load anything. (A natively supported architecture can appear in both columns: a repo can ship modelling code that newer library versions no longer need. Check the model card.) The cache rules are re-implemented from the environment-variable reference for illustration; the library's own behaviour is what counts.

### Listing 6: the Inference Providers request, built but not sent

```python
import json
import os
import urllib.request

# Build (but do NOT send) the request that the Inference Providers docs describe for chat completions:
# base URL https://router.huggingface.co/v1, bearer token, OpenAI-style JSON body, optional policy suffix on the model id.
BASE_URL = "https://router.huggingface.co/v1"
MODEL = "<org>/<model>:fastest"          # placeholder; the suffix picks a provider policy (:fastest, :cheapest, :preferred)
token = os.environ.get("HF_TOKEN", "<set HF_TOKEN in the environment>")

payload = {"model": MODEL, "messages": [{"role": "user", "content": "Say hello in five words."}]}
req = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)

print(req.get_method(), req.full_url)
for key, value in req.header_items():
    print(f"  {key}: {'Bearer ***' if key.lower() == 'authorization' else value}")
print("  body:", req.data.decode("utf-8"))
# urllib.request.urlopen(req) would send it. Not executed here: it needs a real token and spends provider credits.
```

Output (executed; nothing was sent):

```text
POST https://router.huggingface.co/v1/chat/completions
  Authorization: Bearer ***
  Content-type: application/json
  body: {"model": "<org>/<model>:fastest", "messages": [{"role": "user", "content": "Say hello in five words."}]}
```

This is the OpenAI-style chat-completions shape the Inference Providers page documents. The model id is a placeholder, and the suffix after the colon is the provider-selection policy.

### Listing 7: the library calls (NOT EXECUTED)

Not run in this module's verification: it needs `huggingface_hub`, `transformers`, `datasets`, a token for some lines, and network access, and no output is claimed. Every import, function and parameter name below was checked against the documentation pages fetched on 2026-10-26.

```python
# NOT EXECUTED in this module's verification (needs the packages, network access, and for some lines a token or a GPU).
# Names and parameters were checked against the Hugging Face documentation fetched on 2026-10-26.
import os

from huggingface_hub import InferenceClient, get_safetensors_metadata, hf_hub_download, login, snapshot_download

REPO = "Qwen/Qwen2.5-0.5B"
REVISION = "060db6499f32faf8b98477b0a26969ef7d8b9987"       # a full 40-character commit hash, not "main"

login()                                                       # or: `hf auth login` in a terminal, or set HF_TOKEN
config_path = hf_hub_download(repo_id=REPO, filename="config.json", revision=REVISION)
folder = snapshot_download(repo_id=REPO, revision=REVISION,
                           allow_patterns=["*.json", "*.safetensors"])   # skip files you do not need
meta = get_safetensors_metadata(REPO, revision=REVISION)      # reads only the file headers, like Listing 4

from transformers import AutoModelForCausalLM, AutoTokenizer  # noqa: E402

tokenizer = AutoTokenizer.from_pretrained(REPO, revision=REVISION)
model = AutoModelForCausalLM.from_pretrained(
    REPO, revision=REVISION,
    use_safetensors=True,                                     # refuse pickle-based weight files
    trust_remote_code=False,                                  # the default; leave it False unless you have read the code
    dtype="auto", device_map="auto",                          # model cards often still spell it torch_dtype="auto"
)

from datasets import load_dataset                             # noqa: E402

minds = load_dataset("PolyAI/minds14", "en-US", split="train")   # from the datasets quickstart
stream = load_dataset("PolyAI/minds14", "en-US", split="train", streaming=True)   # iterate without a full download

client = InferenceClient()                                    # hosted inference through Inference Providers
reply = client.chat.completions.create(
    model="<org>/<model>:cheapest",                           # a model id served by providers; check the docs for what exists
    messages=[{"role": "user", "content": "Say hello in five words."}],
)
print(reply.choices[0].message)

# peft / trl / accelerate (names from their documentation index pages; see Track 04 for what they do):
#   from peft import LoraConfig, get_peft_model
#   from trl import SFTTrainer, DPOTrainer, GRPOTrainer, DistillationTrainer
#   from accelerate import Accelerator   # accelerator.prepare(...), accelerator.backward(loss)
```

## Visual diagram

A repository, its refs and what `revision=` selects:

```
  Hub repository  org/name   (a git repository; large files stored with Xet)

  commit A ──► commit B ──► commit C ──► commit D      each commit has an immutable 40-character hash
                                ▲            ▲
                                │            └── refs/heads/main     moves on every push
                                └─────────────── refs/heads/other    moves too (tags and refs/pr/N are refs as well)

  revision="main"                -> whatever D is today, and something else tomorrow
  revision="<full hash of C>"    -> exactly C's files, for as long as the repository exists
```

The local cache layout (from the `huggingface_hub` guide), and why two revisions are cheap:

```
  ~/.cache/huggingface/hub/                       (HF_HOME, HF_HUB_CACHE move it)
  └── models--org--name/
      ├── blobs/       4f2a...  (weights, content-addressed)     c91d...  (config v1)   e07b...  (config v2)
      ├── refs/        main  ->  "D's hash"
      ├── snapshots/
      │   ├── <hash of C>/   config.json -> ../../blobs/c91d..   model.safetensors -> ../../blobs/4f2a..
      │   └── <hash of D>/   config.json -> ../../blobs/e07b..   model.safetensors -> ../../blobs/4f2a..   (shared)
      └── trees/       file lists per commit
```

The safetensors byte layout, with the numbers from Listing 3's tiny file:

```
  byte 0                          byte 8                                     byte 552                                    byte 679
  ┌───────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────┐
  │ N = 544 (u64, little-endian)  │ JSON header, 544 bytes                   │ tensor bytes, 127 bytes                   │
  │ "20 02 00 00 00 00 00 00"     │ {"block0.attn.q":{                       │ [0,20)    block0.attn.q  F16 (2,5)        │
  │                               │    "dtype":"F16","shape":[2,5],          │ [20,32)   block0.mlp.up  BF16 (3,2)       │
  │                               │    "data_offsets":[0,20]},               │ [32,56)   embed.weight   F32 (3,2)        │
  │                               │   "block0.mlp.up":{ ... }, ...           │ [56,56)   empty          F32 (0,4)        │
  │                               │   trailing spaces up to byte 552         │ ... [111,127) tricky F32 (4,)             │
  └───────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────┘
  read 8 bytes -> know N -> read N bytes -> know every tensor's name, dtype, shape and byte range
  (offsets inside the header count from byte 552; Listing 4 stops after the header: 32,288 bytes of a 988,097,824-byte file)
```

How the libraries relate:

```
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │ models        datasets        Spaces        Inference Providers / Endpoints │
      └─────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
          ┌─────────────────────────────────────────────────────────────────────┐
          │ huggingface_hub: auth, cache, revisions, downloads, InferenceClient │
          └─────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
     safetensors ──► transformers ◄── tokenizers          datasets ──► trl / Trainer
     (weights)       (model code)     (text -> ids)         (data)       (SFT, DPO, GRPO, distillation)
                       ▲       ▲
                       │       └── accelerate (devices, distributed training)
                       └──────── peft (adapters)
```

## Practice

### 1. Write a file by hand

Without running code, for a safetensors file holding one `I8` tensor named `a` with shape `[3]` and values 1, 2, 3, write the header JSON (compact, no spaces), the value of `N` without padding and with padding to a multiple of 8, the first 8 bytes in hex for the padded case, and the total file size in each case. Then check with `write_safetensors`.

<details><summary>Answer</summary>

Header: `{"a":{"dtype":"I8","shape":[3],"data_offsets":[0,3]}}`, which is 53 bytes. Without padding: `N = 53` (0x35) and the file is 8 + 53 + 3 = **64** bytes. Padded to a multiple of 8: three spaces are appended, `N = 56` (0x38), first 8 bytes `38 00 00 00 00 00 00 00`, file size 8 + 56 + 3 = **67** bytes, with the data starting at byte 64. Both are valid under the spec (it allows trailing whitespace); `write_safetensors` produces the padded form, and `parse_header` accepts either.

</details>

### 2. Corrupt a byte

Take the tiny file from Listing 3, flip one bit in the middle of the `embed.weight` data, and parse it with `load_safetensors`. What happens? Then flip one bit inside the `"F16"` dtype string, and another inside a tensor name. What is different, and what does this tell you about what safetensors guarantees?

<details><summary>Answer</summary>

A flipped data bit parses without any error and returns a slightly different number (in our run `0.64042264` became `0.6404226`): the format validates structure (lengths, offsets, sizes) but has no checksum over values, and the spec says tensor values "are not checked". A flipped bit in the dtype string is caught (`F16` became `F06`, an unknown dtype), because it breaks the structure. A flipped bit inside a tensor name is *accepted*: `embed.weight` became `dmbed.weight` and the file still parsed. So safetensors guarantees "loading will not execute code and will not read outside the file", not "these are the bytes the author wrote". For integrity, pin the commit and verify hashes (`hf cache verify`, or the `sha256` the Hub API lists for large files).

</details>

### 3. Preflight a repo

Adapt `remote_code_report` from Listing 5 to take a revision and run it on a repo of your choice at its latest commit. Does it ship `.py` files? What would you read before setting `trust_remote_code=True`?

<details><summary>Answer</summary>

Look at `auto_map` in `config.json`: each entry names a `module.Class` in a `.py` file in the repo. Read those modules and every file they import from the repo (in Listing 5's output, `Qwen/Qwen-7B` ships five `.py` files, including `modeling_qwen.py` and `tokenization_qwen.py`; the tokenizer is code too). Look for network calls, subprocess calls, `exec`/`eval`, file writes outside the cache and anything that reads environment variables or credentials. Then pin the revision you reviewed (`revision=<full hash>`). If you cannot review it, do not load it with remote code enabled.

</details>

### 4. Where does it go?

`HF_HOME=/data/hf` is set and `HF_HUB_CACHE` is not. Which folder holds `mistralai/Mistral-7B-v0.1`'s files, and what is the folder for the dataset `PolyAI/minds14`? What changes if you also set `HF_HUB_CACHE=/fast/models`?

<details><summary>Answer</summary>

`/data/hf/hub/models--mistralai--Mistral-7B-v0.1` and `/data/hf/hub/datasets--PolyAI--minds14` (slashes in the repo id become `--`; `HF_HUB_CACHE` defaults to `$HF_HOME/hub`). With `HF_HUB_CACHE=/fast/models` the repos go under `/fast/models/` instead (`/fast/models/models--mistralai--Mistral-7B-v0.1`), while the token and other HF data stay under `HF_HOME`. Listing 5 prints these rules for the model case.

</details>

### 5. Fix a nightly job

A nightly CI job runs `snapshot_download("Qwen/Qwen2.5-0.5B")` and then your evaluation. Last night's accuracy dropped. List what could have changed that is *not* your code, and the changes that make the job reproducible and safer.

<details><summary>Answer</summary>

With no `revision`, the job follows `main`, so any file in the repository can change between runs: weights, tokenizer, chat template, generation defaults, even the licence. Changes: pin `revision` to a full 40-character commit hash and update it deliberately (re-running the evaluation and re-reading the licence); restrict files with `allow_patterns` (e.g. `*.json`, `*.safetensors`) so pickle `.bin` copies are never fetched; pass `use_safetensors=True` and keep `trust_remote_code=False`; use a fine-grained read-only token if the repo is gated; cache or mirror the files so the job does not depend on the Hub being reachable; record the commit hash in the evaluation report.

</details>

### Checkpoint quiz

1. Name the three kinds of Hub repository and one thing each is for.
2. Why is `revision="main"` unsafe for a production deployment, and what should replace it?
3. What are the three things in a safetensors file, in order, and what does the first one contain?
4. Why can a pickle-based checkpoint run code when loaded, and why can a safetensors file not?
5. What does `trust_remote_code=True` do, and what two things should you do before enabling it?
6. A safetensors file parses cleanly. What have you *not* established about it?

<details><summary>Answers</summary>

1. Models (weights, config, tokenizer, card), datasets (data files plus a dataset card), Spaces (a demo app's code).
2. `main` is a moving branch, so files can change under you. Use a full commit hash (and update it deliberately).
3. An 8-byte little-endian unsigned integer `N` (the header's byte length), `N` bytes of JSON header (names, dtypes, shapes, byte ranges, optional `__metadata__`), then the raw tensor bytes.
4. Unpickling executes a stream of opcodes that can import and call arbitrary Python callables (`REDUCE` after an import), so the file can run code. A safetensors reader only parses JSON and slices bytes by arithmetic; nothing in the format can name something to call.
5. It lets `from_pretrained` import and run Python modelling code from the repository, with your privileges. Read that code, and pin the revision you read (also prefer natively supported models and isolate the process).
6. That the weights are the intended ones (no checksum or signature in the format), that there is no backdoor in the weights, or that tokenizer and config files are benign. Verify hashes and trust the source.

</details>

> [!check]
> - I can explain why a Hub model is a git revision and pin one by its full commit hash
> - I can handle a gated model with a fine-grained token kept out of code
> - I can say where the cache is, how repos are named in it, and how to move it
> - I can preflight a repo for remote code before loading it
> - I can describe the safetensors layout and why it cannot run code on load
> - I can place each of transformers, tokenizers, datasets, huggingface_hub, accelerate, peft and trl on a map

## Project

Build `fetch_model.py`, a pin-and-verify downloader that uses only the standard library and your Listing 2 parser. Given a repo id and a revision it must: resolve the revision to a full commit hash through the Hub API (and refuse a branch name unless you pass an explicit `--resolve` flag, printing the hash it resolved to); list the repo's files with sizes and checksums (the API's `?blobs=true` output includes an `lfs.sha256` for large files); refuse repos whose `config.json` has an `auto_map` unless told otherwise; download only the file patterns you allow (default: JSON, tokenizer files, `.safetensors`, never `.bin`, `.pt`, `.pkl`, `.ckpt`); verify each large file's SHA-256 against the API; run `parse_header` over every safetensors file and fail if any is invalid; and write a lock file (repo, commit, file names, sizes, hashes) that a later run can check without trusting the network. It must work for a small public model and exit cleanly (with a message, not a traceback) on a gated one.

Test it against a small model of your own choosing, then deliberately corrupt one downloaded byte and show that your verification step, not the safetensors parser, catches it. Write down what your tool still cannot tell you about the model. There is no reference solution.

## Interview questions

> [!interview] Why do open-weight models ship as safetensors instead of PyTorch `.bin` files, and what does safetensors still not protect you from?

<details><summary>What a strong answer covers</summary>

Pickle executes opcodes on load, so a malicious checkpoint can import and call arbitrary functions (`REDUCE` after an import of `exec`, `os.system`), and scanners are best-effort (the Hub documentation says its scan is "not 100% foolproof"). safetensors is an 8-byte length, a JSON header and raw bytes: a reader parses JSON, validates offsets and sizes (no holes or overlaps, bounded header), and slices bytes, so load-time code execution is not expressible, and it adds lazy and zero-copy loading. It does not give integrity (no checksum), authenticity (anyone can upload), or safety of the weights' behaviour (a backdoored model is still a valid file), and it does not cover tokenizer files or `trust_remote_code` Python. Mitigations: pin commits, verify hashes, use trusted sources, `use_safetensors=True`, `trust_remote_code=False`.

</details>

> [!interview] A teammate wants to add `trust_remote_code=True` to get a new model working. How do you respond?

<details><summary>What a strong answer covers</summary>

Explain that it executes Python from the repository on your machine with your privileges (the documentation says to enable it only "for repositories you trust and in which you have read the code"). Ask first whether a newer `transformers` version supports the architecture natively. If not: preflight (`auto_map`, the `.py` files), read the code, pin the exact revision that was reviewed, run it in an isolated environment without credentials or access to production data, and record the decision. Mention supply-chain risk: an unpinned revision means the code can change after review, and the code's own dependencies are part of the attack surface.

</details>

> [!interview] How would you make model downloads reproducible and safe in a CI/CD pipeline that builds a container image?

<details><summary>What a strong answer covers</summary>

Pin full commit hashes in configuration (not `main`), recorded with the licence reviewed; download only the needed files (`allow_patterns`, excluding pickle formats) at build time rather than at container start; use a fine-grained read-only token from the CI secret store (or the Hub's documented trusted-publisher token exchange for CI) and never bake it into the image; set `HF_HOME`/`HF_HUB_CACHE` deliberately and `HF_HUB_OFFLINE=1` at runtime so production never reaches out; verify hashes and run header validation as a build step; treat updating a pin as a change that re-runs evaluation. Bonus: mirror weights into storage you control in case access is revoked or a repository disappears.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `401 Unauthorized` or "Access to model ... is restricted" | gated repo, no token, or access not yet approved | request access in the browser, run `hf auth login` or set `HF_TOKEN`; check the token has read access to that repo |
| Results change between runs with no code change | `revision` defaults to `main` and the repo moved | pin the full commit hash |
| A 7-character hash is rejected or not found by the library | the docs require the full-length hash in `hf_hub_download` | use all 40 characters |
| `ValueError` about `trust_remote_code` when loading | the repo has `auto_map` custom code | preflight, read the code, pin the revision, or use a natively supported model |
| Disk fills up | every revision and every format you download is cached; `.bin` and `.safetensors` copies both | use `allow_patterns`; inspect with `hf cache ls`; set `HF_HOME` to a big disk; delete old revisions |
| Symlink errors or warnings on Windows | the cache uses symlinks | enable developer mode or run as administrator, or set `HF_HUB_DISABLE_SYMLINKS=1` and accept the lost deduplication |
| Production start-up depends on the Hub | the library checks for updates even when files are cached | `HF_HUB_OFFLINE=1` after the cache is warm |
| Your own parser rejects a file `safetensors` loads | the spec text and the implementation differ on a corner (for example leading whitespace) | test against the reference implementation's unit-test vectors, as Listing 3 does |
| Loading a `.bin` file warns or fails about unpickling | `weights_only=True` is the default and refuses non-tensor objects | prefer the `.safetensors` file; do not turn `weights_only` off for untrusted files |

## Further reading & sources

- [Repositories (Hugging Face Hub)](https://huggingface.co/docs/hub/repositories) - the Hub's own description of models, datasets and Spaces as git repositories on Xet storage.
- [Gated models (Hugging Face Hub)](https://huggingface.co/docs/hub/models-gated) - how access requests, approval modes, revocation and scripted authentication work.
- [User access tokens (Hugging Face Hub)](https://huggingface.co/docs/hub/security-tokens) - token roles (fine-grained, read, write), best practices for production and CI, and how to revoke a leaked token.
- [Pickle Scanning (Hugging Face Hub)](https://huggingface.co/docs/hub/security-pickle) - the Hub's own explanation of why pickle is dangerous, with the opcode examples this module's Listing 5 mirrors.
- [safetensors: Simple, safe way to store and distribute tensors](https://github.com/safetensors/safetensors) - the project README: the format specification implemented in Listing 2 and the stated rationale for replacing pickle (the old `huggingface/safetensors` address redirects here).
- [Download files from the Hub (huggingface_hub)](https://huggingface.co/docs/huggingface_hub/guides/download) - `hf_hub_download`, `snapshot_download`, the `revision` parameter and `allow_patterns`.
- [Understand caching (huggingface_hub)](https://huggingface.co/docs/huggingface_hub/guides/manage-cache) - the cache layout (`blobs`, `refs`, `snapshots`) and the tools to inspect and verify it.
- [Inference Providers (Hugging Face)](https://huggingface.co/docs/inference-providers/index) - the hosted, OpenAI-compatible inference option, its authentication and provider-selection policies, as documented on the fetch date.

## Next

[Module 14: Small Language Models (SLMs)](../14-small-language-models/README.md)
