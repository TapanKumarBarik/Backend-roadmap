# Module 09: Vision and Audio Inputs

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**, at folder position 09 (the track README's numbered list is off by one; the folder names are the authority). [Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md) and [Module 02: The Responses API and Statefulness](../02-the-responses-api-and-statefulness/README.md) are the two text endpoints; [Module 08: The Embeddings API](../08-the-embeddings-api/README.md) was the last stop. This module widens the *input* of those same endpoints from "a string" to "a list of typed parts" that can carry images and audio. Cost thinking builds on [Module 12: Token Cost Economics](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) and the limits on [Module 11: Context Windows Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md). Every shape below comes from the official API reference and guides fetched for this module; where a topic has its own module it is linked, not repeated.

After this module you can:

- build a multimodal message in both the Chat Completions and Responses spellings and validate it before sending;
- choose between an image URL, a base64 data URL and an uploaded file, and say what each costs you;
- estimate image input tokens with the formulas the OpenAI guide prints, as a tested function, and spot the cases where a "cheaper" detail level is not cheaper;
- build a valid PNG with only `struct` and `zlib`, wrap it in a data URL and prove the bytes survive the round trip;
- name the audio endpoints (transcription, speech, audio in a chat, realtime), their documented size and format limits, and split a recording that is too large;
- list the failure modes of image and audio input and the checks that catch them before you pay for a call.

Why it matters: images are the quietest way to blow a token budget (one photo can cost as much as several pages of text) and the easiest way to hit a hard limit in production (format, size, patch count). Audio adds privacy questions that text rarely raises. All of it can be checked on your side, for free, before the request leaves your machine.

Scope: this module is about *sending* images and audio to a model and reading text back. Generating images or video, speech models themselves, and the realtime voice pipeline in depth belong to [Track 16: Speech & Multimodal Models](../../16-speech-and-multimodal-models/README.md) ([Module 12: Vision: How LLMs See Images](../../16-speech-and-multimodal-models/12-vision-how-llms-see-images/README.md), [Module 13: Vision Use Cases: OCR, Documents, UI](../../16-speech-and-multimodal-models/13-vision-use-cases-ocr-documents-ui/README.md), [Module 08: TTS APIs in Practice](../../16-speech-and-multimodal-models/08-tts-apis-in-practice/README.md), [Module 11: Realtime Speech-to-Speech APIs](../../16-speech-and-multimodal-models/11-realtime-speech-to-speech-apis/README.md)).

> [!note] How to read the numbers in this module. You cannot call a provider from this curriculum environment, so nothing here was sent to OpenAI. Everything that touches a provider runs against **a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model**. Limits, formulas and model names are copied from OpenAI's pages as fetched in **Oct 2026** (guides on developers.openai.com plus the `openai/openai-openapi` spec, last commit dated 2026-10-24). They change. The official pages are the source of truth, and a table in this module is configuration to refresh, not a fact to memorise.

## Concept

> [!key] A multimodal message is not a string but a list of typed parts (text, image, audio), and each part brings its own source, its own options and its own cost. Because the provider turns pixels and samples into tokens by published rules, you can compute the cost, check the limits and validate the bytes yourself, before the request is sent.

## Explanation

### A message is a list of typed parts

A text-only chat message has `"content": "hello"`. To add an image or audio you replace the string by a list, and each element says what it is with a `type` field. Order is preserved, so "text, image" and "image, text" are different messages.

| Idea | Chat Completions part | Responses part |
| --- | --- | --- |
| text | `{"type": "text", "text": ...}` | `{"type": "input_text", "text": ...}` |
| image | `{"type": "image_url", "image_url": {"url": ..., "detail": ...}}` | `{"type": "input_image", "image_url": <string>, "detail": ...}` or `"file_id"` instead of the URL |
| audio | `{"type": "input_audio", "input_audio": {"data": <base64>, "format": "wav"\|"mp3"}}` | not covered: see the note below |

Sources: the OpenAPI spec schemas `ChatCompletionRequestMessageContentPartImage`, `...PartAudio`, `InputImageContent`, and the *Images and vision* and *Audio in Chat Completions* guides, checked Oct 2026. Two details worth noticing. In Chat Completions the image URL sits one level down (`image_url.url`), in Responses it is a plain string. And the *Audio in Chat Completions* page says the Responses docs "currently describe text and image inputs with text outputs", so audio input in a chat goes through Chat Completions.

> [!model] Think of the message as an envelope holding several flat items, each labelled on the outside. The API never guesses what an item is from its bytes; the label (`type`) tells it which decoder, which limits and which pricing rule to apply. A wrong or missing label is a validation error, not a guess.

### Where the image bytes come from

The guide lists three ways to hand over an image: a fully qualified URL, a Base64-encoded data URL, or a file ID created through the Files API (`purpose="vision"`). In the spec the Chat Completions image part only has `url`; `file_id` exists on the Responses `input_image` part.

| Source | You send | Good because | Costs you |
| --- | --- | --- | --- |
| `https://` URL | a short string | tiny request; nothing to encode | the provider must be able to fetch it, so it must be reachable from outside; the image can change or vanish between your check and their fetch; you never saw the exact bytes they used |
| data URL (`data:image/png;base64,...`) | the bytes, inline | self-contained; you validated exactly what they got; works for private images | the request grows by about a third (base64 emits 4 characters per 3 bytes); it counts toward the request-size limit; the payload tends to end up in your logs |
| file ID | a short string | upload once, reuse across requests | one more API round trip; the stored file lives until you delete it or set an expiry |

A data URL follows [RFC 2397](https://www.rfc-editor.org/rfc/rfc2397): `data:<mime>;base64,<payload>`. Block 2 below builds one and parses it back.

### How images turn into tokens (as the guide states it)

A vision model never sees your file. The provider decodes it, **resizes** it by per-model rules, cuts it into fixed-size blocks, and bills those blocks as input tokens. Those tokens count toward your tokens-per-minute limit and sit inside the context window like any other tokens. This is why one photo can cost more than a page of text.

The guide describes two families of rules and a `detail` parameter (`low`, `high`, `original`, `auto`; omitted means `auto`; which values a model accepts depends on the model). The *patch-based* rule, abridged from the guide's "Patch-based image tokenization" section (checked Oct 2026; the wording is the guide's, the omissions are mine):

> A. Compute how many 32px x 32px patches are needed to cover the image after applying the pixel-dimension limit: `patch_count = ceil(width/32)×ceil(height/32)`.
>
> B. When the selected model and detail level specify a resizing patch budget, scale the image down proportionally if it exceeds that budget: `shrink_factor = sqrt((32^2 * patch_budget) / (width * height))`, then `adjusted_shrink_factor = shrink_factor * min(floor(width * shrink_factor / 32) / (width * shrink_factor / 32), floor(height * shrink_factor / 32) / (height * shrink_factor / 32))`.
>
> C. If step B resized the image, round down the final scaled width and height to integer pixels. Compute the patches needed to cover the resulting image. If this count exceeds 30,000 patches, the API rejects the request.
>
> D. Multiply the patch count by the model's multiplier and round up to get the billable image input tokens.

The guide's own worked examples for one model at `detail: high` (2,500-patch budget, multiplier 1.2): a 1024 × 1024 image needs 1,024 patches and bills `ceil(1024 × 1.2) = 1229` tokens; a 2048 × 2048 image is shrunk to 1600 × 1600 (2,500 patches) and bills 3,000; a 4096 × 512 image stays at its size (2,048 patches) and bills 2,458.

The older *tile-based* rule (still listed for some models) is: with `low` an image costs only the model's **base tokens** whatever its size; otherwise scale to fit 2048 × 2048, scale the shortest side down to 768 if it is longer, count the 512px squares needed, and bill `base + tiles × tile_tokens`.

The per-model part is a table: for each model family the supported detail levels, the pixel limit and patch budget for each, and a multiplier (or the base and tile tokens). Block 3 keeps the rows it needs in a Python dict and says so. The same guide warns that "other models and specialized variants can use different limits", that billing "can differ by one token", and it points to an [image input cost calculator](https://developers.openai.com/api/docs/guides/image-cost-calculator) page as the arbiter when your function and your bill disagree.

Block 3 implements steps A to D and the tile rule, asserts that it reproduces the guide's three worked examples and the calculator page's 6000 × 6000 example (35,344 patches at `original`, which is over the limit; 2,500 at `high`), and then prints a size × detail × model table. Read the output for three lessons, all visible there:

1. **`low` does not always mean cheaper.** For the `gpt-5.4` row, `low` has a 2048-pixel limit and a 6,144-patch budget, so a 2048 × 2048 image costs 4,916 tokens at `low` and 3,000 at `high`. The guide says this in words ("`low` does not always use fewer tokens than `high`"); the table shows it in numbers.
2. **The same pixels cost different amounts on different models.** A 4096 × 512 banner is 2,458 tokens on one row and 615 on another, because the two rows cap the long side differently.
3. **`original` can be rejected, `high` is not.** A 6000 × 6000 image needs 35,344 patches uncapped; the request is refused rather than resized. At `high` the budget shrinks it to 2,500.

> [!example] Worked case: a 4000 × 3000 phone photo on the first row of the table. At `original` it needs 125 × 94 = 11,750 patches, so 14,100 tokens. At `high` the budget shrink (step B) lands on 2,451 patches, so 2,942 tokens. At `low` it is fitted into 512 × 512 and costs 231. Same photo, a 6x spread. Use `original` only when you need fine detail or exact coordinates (OCR, small objects, computer use), which is also what the guide recommends.

> [!pitfall] Do not copy the numbers in Block 3 into your product. They are a dated snapshot, some of the rows the guide lists are marked deprecated, and model names move. Keep the table in configuration, refresh it from the guide, and test your estimator against the provider's `usage` field on real responses. The estimate is for budgeting and pre-flight checks. The response's `usage` is what you are billed on.

### Limits the guide states

| Requirement | Supported inputs (guide, checked Oct 2026) |
| --- | --- |
| File types | PNG, JPEG, WEBP, non-animated GIF |
| Request size | up to 512 MB total payload per request |
| Image count | up to 1,500 images per request |
| Per-image patches | up to 30,000 after the resizing rules; over that the request is rejected, "not automatically resized" |

Image tokens and the rest of the prompt must also fit the model's input and context limits, and "a token estimate does not guarantee that a request meets every input limit".

### Audio: the documented doors

OpenAI documents several different ways in for audio. They are different products, so choose by the job, not by the word "audio":

| You want | Endpoint or interface | Documented inputs and limits (checked Oct 2026) |
| --- | --- | --- |
| text from a finished recording | `POST /v1/audio/transcriptions` (multipart form: `file`, `model`, optional `prompt`, `language(s)`, `response_format`) | file up to **25 MB**; the guide lists `mp3, mp4, mpeg, mpga, m4a, wav, webm` (the OpenAPI spec also names `flac` and `ogg`: the two sources differ, so test your format); the response is JSON such as `{"text": ..., "languages": [...]}`; larger files must be compressed or split, and the guide warns that cutting mid-sentence "can remove context and reduce accuracy" |
| live captions, continuous translation | Realtime transcription / translation sessions | streaming audio in, incremental transcript events out; not the file endpoint |
| spoken audio from text | `POST /v1/audio/speech` | `input` up to **4096 characters**; 13 built-in voices in the spec; formats `mp3` (default), `opus`, `aac`, `flac`, `wav`, `pcm`; `speed` 0.25 to 4.0; the guide says usage policies require telling end users that the voice is AI-generated |
| audio in and out inside a chat | Chat Completions with `modalities: ["text", "audio"]`, an `audio: {voice, format}` object, and `input_audio` parts | input audio is base64 with format `wav` or `mp3` (spec); the reply's audio arrives base64 in `message.audio.data` |
| a live, interruptible voice conversation | the Realtime interface (session-based; WebRTC for browsers, WebSocket for servers, SIP for phones) | the model works directly with audio, keeps session state and can call tools; browsers use a short-lived client secret that *your server* creates, so the real key never reaches the page |

The Realtime interface is an idea more than a request: instead of one request and one response, you open a **session** and exchange a stream of events (audio chunks in, audio and text events out, tool calls in between), and the model can be interrupted. The *Voice agents* guide lays out the choice as three architectures: a full-duplex product the guide calls GPT-Live, the Realtime API (one model that hears, decides and speaks), or a **chained pipeline** (speech-to-text, then your own text agent, then text-to-speech) when you want to inspect or replace each stage. The depth for all of this lives in Track 16 ([Module 04: Streaming and Realtime Transcription](../../16-speech-and-multimodal-models/04-streaming-and-realtime-transcription/README.md) and [Module 11: Realtime Speech-to-Speech APIs](../../16-speech-and-multimodal-models/11-realtime-speech-to-speech-apis/README.md)). This module only needs the map.

> [!pitfall] The audio line-up was moving fast when these pages were fetched: the transcription guide says `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` and the translations endpoint are deprecated with a shutdown date of **February 26, 2027**, and the text-to-speech guide says `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` are deprecated with a shutdown date of **January 6, 2027**, with a different workflow (the Realtime API) as the replacement. Read the model and deprecation pages on the day you build, keep model IDs in configuration, and run a smoke test before and after every upgrade.

### Privacy and cost

**Privacy.** From OpenAI's *Data controls* page (checked Oct 2026): data sent to the API is not used to train models unless you opt in; by default API usage is logged for abuse monitoring and retained for up to 30 days (the table shows 30 days for chat completions, responses and speech, and none for audio transcriptions); eligible customers can apply for stricter retention controls. Image and file inputs have a stated exception: they are scanned for child-safety content, and a flagged image is retained for manual review *even under zero data retention*. Files you upload through the Files API stay until you delete them or they expire. This is a summary of one vendor's page, not legal advice; your contract and region decide what applies to you.

Practical rules that follow (these are engineering judgement, not quotes): get consent before sending a person's voice or face; strip EXIF and GPS metadata before upload (the guide says the model ignores file names and metadata, but your upload still carries them to the provider); crop or blur what the question does not need (ID numbers, faces in the background); never put base64 payloads into application logs or traces; and prefer an `https://` URL only for images that are already public.

**Cost.** Image bytes are billed as input tokens at the model's rate, which is the number Block 3 computes; audio is billed under the pricing page's own rules, which differ by model, so look it up rather than assuming. The levers you control are the detail level, downscaling before upload, how many images go in a request, and whether a cheaper model is enough. Cost = tokens ÷ 1,000,000 × price per million tokens; Block 3 shows the arithmetic with an **illustrative** price, because real prices belong on the pricing page, not in a tutorial.

### What goes wrong

| Symptom | Likely cause | Check or fix before sending |
| --- | --- | --- |
| request rejected, image "unsupported" | BMP, TIFF, HEIC, animated GIF, or a PDF renamed `.png` | sniff the magic bytes (Block 2); convert to PNG/JPEG/WEBP; do not trust file extensions |
| request rejected, "too many patches" or similar | a huge image at a detail level without a patch budget (`original`) | compute patches first (Block 3); pick `high`, or downscale |
| request rejected, body too large | many or large images inline | count `4 × ceil(bytes / 3)` per image; upload via the Files API; send fewer |
| the model answers about the wrong image or says it cannot see one | corrupt or truncated base64, wrong MIME in the data URL, a URL the provider cannot reach | decode your own data URL and compare bytes (Block 2); test the URL from outside your network |
| the model misreads small text, a rotated page or a chart | resized below legibility, or a documented limitation | enlarge or crop the region, use `original` when the model offers it, rotate upright, and for critical values (amounts, IDs, dosages) cross-check with OCR or a human |
| the bill is far above the estimate | `original` on large images, many images per request, resent history that includes images | log `usage` per request; compare with the estimator; drop old images from history |
| a long recording fails | file over 25 MB | compress, or split on frame boundaries (Block 5) and, where you can, on pauses |

The guide's own limitations list is the one to read before designing a feature: medical images are out of scope, non-Latin text may be weaker, small text, rotation, graphs with varying line styles, precise spatial reasoning (its example is chess positions), panoramic and fisheye images, counting, and CAPTCHAs (blocked) all appear on it.

## Code

Everything below is plain Python 3.13 standard library. The five blocks are consecutive parts of one file: paste them in order into `vision_lab.py` and run `python vision_lab.py`. The shared plumbing in Block 4 (the stand-in server) is collapsed; the rest is shown in full. Each block prints under a numbered header, and the output pasted after it is from an actual run (the run is deterministic, a second run gave an identical file).

### Block 1: typed parts, two spellings, a local validator

```python
import base64
import json
import math
import os
import re
import struct
import zlib

MODEL = os.environ.get("VISION_MODEL", "your-vision-model-id")   # config, not a constant

# ---- Chat Completions spelling: content is a list of typed parts -------------
def text_part(text):
    return {"type": "text", "text": text}

def image_part(url, detail=None):
    img = {"url": url}
    if detail is not None:
        img["detail"] = detail
    return {"type": "image_url", "image_url": img}

def audio_part(b64_data, fmt):
    return {"type": "input_audio", "input_audio": {"data": b64_data, "format": fmt}}

# ---- Responses spelling of the same idea ------------------------------------
def r_text_part(text):
    return {"type": "input_text", "text": text}

def r_image_part(url, detail="auto"):
    return {"type": "input_image", "image_url": url, "detail": detail}

DETAILS = {"auto", "low", "high", "original"}
AUDIO_IN_FORMATS = {"wav", "mp3"}

def validate_parts(content):
    """Cheap client-side checks of the shapes in the OpenAPI spec (my checks, not the server's)."""
    if isinstance(content, str):
        return
    if not isinstance(content, list) or not content:
        raise ValueError("content must be a string or a non-empty list of parts")
    for i, part in enumerate(content):
        kind = part.get("type")
        if kind == "text":
            ok = isinstance(part.get("text"), str)
        elif kind == "image_url":
            img = part.get("image_url", {})
            url = img.get("url", "")
            ok = (url.startswith("https://") or url.startswith("data:image/")) \
                and img.get("detail", "auto") in DETAILS
        elif kind == "input_audio":
            aud = part.get("input_audio", {})
            ok = isinstance(aud.get("data"), str) and aud.get("format") in AUDIO_IN_FORMATS
        else:
            ok = False
        if not ok:
            raise ValueError(f"content[{i}] is not a valid {kind!r} part")

def show(obj, limit=48):
    """Print JSON with long strings shortened, so a base64 payload does not flood the page."""
    def clip(x):
        if isinstance(x, str) and len(x) > limit:
            return x[:limit] + f"...<{len(x)} chars>"
        if isinstance(x, list):
            return [clip(v) for v in x]
        if isinstance(x, dict):
            return {k: clip(v) for k, v in x.items()}
        return x
    print(json.dumps(clip(obj), indent=2))

if __name__ == "__main__":
    print("=== 1. the same question spelled two ways ===")
    chat = {"role": "user", "content": [text_part("What is in this image?"),
                                        image_part("https://example.com/cat.png", "low")]}
    resp = {"role": "user", "content": [r_text_part("What is in this image?"),
                                        r_image_part("https://example.com/cat.png", "low")]}
    validate_parts(chat["content"])
    show({"chat_completions_message": chat, "responses_input_item": resp})
    try:
        validate_parts([image_part("ftp://example.com/cat.png")])
    except ValueError as err:
        print("rejected locally:", err)
```

Output:

```
=== 1. the same question spelled two ways ===
{
  "chat_completions_message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "What is in this image?"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://example.com/cat.png",
          "detail": "low"
        }
      }
    ]
  },
  "responses_input_item": {
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "What is in this image?"
      },
      {
        "type": "input_image",
        "image_url": "https://example.com/cat.png",
        "detail": "low"
      }
    ]
  }
}
rejected locally: content[0] is not a valid 'image_url' part
```

### Block 2: a PNG from `struct` and `zlib`, a data URL, and the round trip

PNG is a signature plus chunks, each `length | tag | data | CRC-32`. The builder writes an `IHDR` (size, bit depth, colour type), one `IDAT` (zlib-compressed scanlines, each starting with a filter byte) and an `IEND`. The parser walks the chunks, checks every CRC and decodes the pixels back. `image_info` sniffs the format from the first bytes instead of trusting a file extension, which is what the failure table above asks you to do.

```python
PNG_SIG = b"\x89PNG\r\n\x1a\n"

def _chunk(tag, data):
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

def make_png(width, height, pixel):
    """Truecolour 8-bit PNG. pixel(x, y) -> (r, g, b). Filter type 0 on every scanline."""
    rows = []
    for y in range(height):
        rows.append(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(width)))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)   # 8-bit, colour type 2 = RGB
    return PNG_SIG + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + _chunk(b"IEND", b"")

def make_gray_png(width, height, value=200):
    """Large flat greyscale PNG cheaply: one repeated scanline, so a 6000 x 6000 image is built fast."""
    row = b"\x00" + bytes([value]) * width
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)   # colour type 0 = greyscale
    return PNG_SIG + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(row * height, 9)) + _chunk(b"IEND", b"")

def parse_png(data):
    """Walk the chunks, verify every CRC, return (width, height, rows of RGB tuples)."""
    if data[:8] != PNG_SIG:
        raise ValueError("not a PNG (bad signature)")
    pos, idat, ihdr, tags = 8, b"", None, []
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        tag, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        (crc,) = struct.unpack(">I", data[pos + 8 + length:pos + 12 + length])
        if zlib.crc32(tag + body) & 0xFFFFFFFF != crc:
            raise ValueError(f"bad CRC in chunk {tag!r}")
        tags.append(tag.decode())
        if tag == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif tag == b"IDAT":
            idat += body
        pos += 12 + length
    width, height, depth, ctype = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    if (depth, ctype) != (8, 2):
        return width, height, None, tags              # fine for the size check; I only decode RGB
    raw = zlib.decompress(idat)
    stride = 1 + 3 * width
    rows = []
    for y in range(height):
        line = raw[y * stride:(y + 1) * stride]
        if line[0] != 0:
            raise ValueError("this tiny decoder only handles filter type 0")
        rows.append([tuple(line[1 + 3 * x:4 + 3 * x]) for x in range(width)])
    return width, height, rows, tags

def to_data_url(mime, data):
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")

def parse_data_url(url):
    m = re.fullmatch(r"data:([\w.+-]+/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})", url)
    if not m:
        raise ValueError("not a base64 data URL")
    return m.group(1), base64.b64decode(m.group(2), validate=True)

SUPPORTED_IMAGE_FORMATS = {"png", "jpeg", "webp", "gif"}   # guide: PNG, JPEG, WEBP, non-animated GIF

def image_info(data):
    """Sniff the format from magic bytes; read width/height where cheap (PNG, GIF)."""
    if data[:8] == PNG_SIG:
        w, h = struct.unpack(">II", data[16:24])
        return {"format": "png", "width": w, "height": h}
    if data[:6] in (b"GIF87a", b"GIF89a"):
        w, h = struct.unpack("<HH", data[6:10])
        return {"format": "gif", "width": w, "height": h}
    if data[:3] == b"\xff\xd8\xff":
        return {"format": "jpeg", "width": None, "height": None}
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return {"format": "webp", "width": None, "height": None}
    if data[:2] == b"BM":
        return {"format": "bmp", "width": None, "height": None}
    return {"format": "unknown", "width": None, "height": None}

if __name__ == "__main__":
    print("=== 2. build a PNG, wrap it in a data URL, parse it back ===")
    W, H = 64, 32
    def pixel(x, y):
        return (220, 30, 30) if x < W // 2 else (30, 30, 220)     # left half red, right half blue
    png = make_png(W, H, pixel)
    url = to_data_url("image/png", png)
    print("PNG bytes:", len(png), "| data URL chars:", len(url), "| prefix:", url[:30])
    print("base64 chars:", len(url) - len("data:image/png;base64,"), "| formula 4*ceil(n/3):", 4 * math.ceil(len(png) / 3))

    mime, back = parse_data_url(url)
    print("round trip identical bytes:", back == png, "| mime:", mime)
    w, h, rows, tags = parse_png(back)
    print("chunks:", tags, "| size:", (w, h))
    print("pixel (0,0):", rows[0][0], "| pixel (63,31):", rows[31][63])
    print("sniffed:", image_info(back))

    broken = bytearray(png)
    broken[45] ^= 0xFF                                           # flip a byte inside IDAT
    try:
        parse_png(bytes(broken))
    except ValueError as err:
        print("corrupted copy rejected:", err)
    try:
        parse_data_url("data:image/png;base64,@@@")
    except ValueError as err:
        print("malformed data URL rejected:", err)
```

Output:

```
=== 2. build a PNG, wrap it in a data URL, parse it back ===
PNG bytes: 116 | data URL chars: 178 | prefix: data:image/png;base64,iVBORw0K
base64 chars: 156 | formula 4*ceil(n/3): 156
round trip identical bytes: True | mime: image/png
chunks: ['IHDR', 'IDAT', 'IEND'] | size: (64, 32)
pixel (0,0): (220, 30, 30) | pixel (63,31): (30, 30, 220)
sniffed: {'format': 'png', 'width': 64, 'height': 32}
corrupted copy rejected: bad CRC in chunk b'IDAT'
malformed data URL rejected: not a base64 data URL
```

The 64 × 32 image is 116 bytes; as a data URL it is 178 characters, and the base64 part follows `4 × ceil(n / 3)` exactly. Flipping one byte inside the image data is caught by the CRC. That is the same kind of check you want before a request: damaged bytes should fail on your side, not as an unexplained model answer.

### Block 3: image tokens, exactly as the guide describes them

```python
from fractions import Fraction

# ---------------------------------------------------------------------------
# DATA, not logic: copied from the OpenAI "Images and vision" guide, checked
# Oct 2026. The guide says other models and specialised variants differ and that
# billing can differ from an estimate by one token. Treat this table as config
# that you refresh from the guide, never as a constant of nature.
# rule = (max_side_px, patch_budget or None); every side is also capped by max_side.
# ---------------------------------------------------------------------------
PATCH_LIMIT = 30_000          # guide: more than this many patches after resizing -> request rejected
PATCH_MODELS = {
    "gpt-6-astra": {"mult": "1.2",  "low": (512, None),   "high": (65535, 2500),
                    "original": (65535, None),  "auto": "original"},
    "gpt-5.5":     {"mult": "1.2",  "low": (512, None),   "high": (2048, 2500),
                    "original": (6000, 10000),  "auto": "original"},
    "gpt-5.4":     {"mult": "1.2",  "low": (2048, 6144),  "high": (2048, 2500),
                    "original": (6000, 10000),  "auto": "high"},
    "gpt-4.1-mini": {"mult": "1.62", "low": (2048, 6144), "high": (2048, 6144),
                     "auto": "high"},                                      # no 'original'
}
TILE_MODELS = {"gpt-4o": (85, 170), "gpt-4o-mini": (2833, 5667)}          # (base tokens, tile tokens)

class ImageRejected(ValueError):
    pass

def patches_for(width, height, model, detail):
    """Steps A-C of the guide: fit, optionally shrink to the patch budget, count 32px patches."""
    spec = PATCH_MODELS[model]
    detail = spec.get(detail) if detail == "auto" else detail
    if detail not in spec or detail in ("mult", "auto"):
        raise ImageRejected(f"{model} does not support detail={detail!r}")
    max_side, budget = spec[detail]
    # A. fit within the pixel limit, keep aspect ratio, never enlarge, round down to whole pixels
    scale = min(1.0, max_side / width, max_side / height)
    w, h = max(1, math.floor(width * scale)), max(1, math.floor(height * scale))
    count = math.ceil(w / 32) * math.ceil(h / 32)
    # B. if the model/detail has a patch budget and we are over it, shrink proportionally
    if budget is not None and count > budget:
        shrink = math.sqrt(32 ** 2 * budget / (w * h))
        fix = min(math.floor(w * shrink / 32) / (w * shrink / 32),
                  math.floor(h * shrink / 32) / (h * shrink / 32))
        shrink *= fix
        w, h = math.floor(w * shrink), math.floor(h * shrink)            # C. round DOWN
        count = math.ceil(w / 32) * math.ceil(h / 32)
    if count > PATCH_LIMIT:
        raise ImageRejected(f"{count} patches exceeds the {PATCH_LIMIT} patch limit; reduce the dimensions")
    return count

def patch_tokens(width, height, model, detail):
    """Step D: billable image input tokens = ceil(patches x model multiplier)."""
    mult = Fraction(PATCH_MODELS[model]["mult"])          # Fraction avoids 3000.0000000000005 surprises
    return math.ceil(patches_for(width, height, model, detail) * mult)

def tile_tokens(width, height, model, detail):
    """Tile-based rule for the older models: base + tile_tokens x number of 512px tiles."""
    base, tile = TILE_MODELS[model]
    if detail == "low":
        return base                                        # low = base tokens only, any size
    s = min(1.0, 2048 / width, 2048 / height)              # fit in 2048 x 2048, never enlarge
    w, h = width * s, height * s
    if min(w, h) > 768:                                    # shortest side down to 768
        s2 = 768 / min(w, h)
        w, h = math.floor(w * s2), math.floor(h * s2)
    return base + tile * math.ceil(w / 512) * math.ceil(h / 512)

def image_tokens(width, height, model, detail="auto"):
    return (tile_tokens if model in TILE_MODELS else patch_tokens)(width, height, model, detail)

def cost_units(tokens, price_per_million):
    """Cost = tokens / 1e6 x price. The price here is ILLUSTRATIVE; read the real one from the pricing page."""
    return tokens / 1_000_000 * price_per_million

if __name__ == "__main__":
    print("=== 3. image token estimates (rules copied from the guide, checked Oct 2026) ===")
    # The three worked examples printed in the guide (gpt-6-astra, detail=high):
    assert patch_tokens(1024, 1024, "gpt-6-astra", "high") == 1229
    assert patch_tokens(2048, 2048, "gpt-6-astra", "high") == 3000
    assert patch_tokens(4096, 512, "gpt-6-astra", "high") == 2458
    # The calculator page's example: 6000x6000 original is rejected, high fits in 2,500 patches.
    assert patches_for(6000, 6000, "gpt-6-astra", "high") == 2500
    try:
        patches_for(6000, 6000, "gpt-6-astra", "original")
    except ImageRejected as err:
        print("6000x6000 original ->", err)
    print("guide's worked examples reproduced: 1229, 3000, 2458 tokens\n")

    sizes = [(512, 512), (1024, 1024), (1920, 1080), (2048, 2048), (4096, 512), (6000, 6000)]
    models = ["gpt-6-astra", "gpt-5.5", "gpt-5.4", "gpt-4.1-mini", "gpt-4o"]
    print(f"{'size':>11} {'detail':>8} " + " ".join(f"{m:>12}" for m in models))
    for w, h in sizes:
        for detail in ("low", "high", "original"):
            cells = []
            for m in models:
                try:
                    cells.append(f"{image_tokens(w, h, m, detail):>12,}")
                except (ImageRejected, KeyError):
                    cells.append(f"{'n/a':>12}")
            print(f"{w:>5}x{h:<5} {detail:>8} " + " ".join(cells))
    print("\n'low' is not always cheaper: gpt-5.4 at 2048x2048 -> low",
          f"{image_tokens(2048, 2048, 'gpt-5.4', 'low'):,}", "vs high", f"{image_tokens(2048, 2048, 'gpt-5.4', 'high'):,}")
    t = image_tokens(1024, 1024, "gpt-6-astra", "high")
    print(f"1,000 images of 1024x1024 at an ILLUSTRATIVE price of 2.00 per million tokens: "
          f"{cost_units(t * 1000, 2.00):.4f} units ({t * 1000:,} tokens)")
```

Output:

```
=== 3. image token estimates (rules copied from the guide, checked Oct 2026) ===
6000x6000 original -> 35344 patches exceeds the 30000 patch limit; reduce the dimensions
guide's worked examples reproduced: 1229, 3000, 2458 tokens

       size   detail  gpt-6-astra      gpt-5.5      gpt-5.4 gpt-4.1-mini       gpt-4o
  512x512        low          308          308          308          415           85
  512x512       high          308          308          308          415          255
  512x512   original          308          308          308          n/a          255
 1024x1024       low          308          308        1,229        1,659           85
 1024x1024      high        1,229        1,229        1,229        1,659          765
 1024x1024  original        1,229        1,229        1,229          n/a          765
 1920x1080       low          173          173        2,448        3,305           85
 1920x1080      high        2,448        2,448        2,448        3,305        1,105
 1920x1080  original        2,448        2,448        2,448          n/a        1,105
 2048x2048       low          308          308        4,916        6,636           85
 2048x2048      high        3,000        3,000        3,000        6,636          765
 2048x2048  original        4,916        4,916        4,916          n/a          765
 4096x512        low           39           39          615          830           85
 4096x512       high        2,458          615          615          830          765
 4096x512   original        2,458        2,458        2,458          n/a          765
 6000x6000       low          308          308        4,916        6,636           85
 6000x6000      high        3,000        3,000        3,000        6,636          765
 6000x6000  original          n/a       12,000       12,000          n/a          765

'low' is not always cheaper: gpt-5.4 at 2048x2048 -> low 4,916 vs high 3,000
1,000 images of 1024x1024 at an ILLUSTRATIVE price of 2.00 per million tokens: 2.4580 units (1,229,000 tokens)
```

Read the table by column: the first two columns are the same rules with different limits (compare the 4096 × 512 row), and the last column is the tile rule, where `low` is a flat 85 whatever the size. `n/a` means the model has no such detail level or the request would be rejected (the 6000 × 6000 `original` cell). The 3,001 you will see in Block 4 for a 6000 × 6000 image at `high` is these 3,000 image tokens plus one token for the one-word question: the stand-in counts words as text tokens, which is **not** how a real tokenizer counts ([Module 12: Token Cost Economics](../../01-tokens-and-language-modeling/12-token-cost-economics/README.md) covers real counting).

### Block 4: the exact request body, sent to a local stand-in

The stand-in is **a local stand-in that mimics the documented shape; the model behind it is scripted, not a real model**. It checks the bearer header, enforces a body-size cap you choose, decodes any image data URL it receives, rejects unsupported formats and over-limit patch counts, and then returns a canned sentence that quotes what it actually decoded (the mean colour of each half of a PNG, so you can see the bytes arrived intact). It does not look at the picture the way a vision model does. The `usage` numbers come from this module's own estimator, so they exercise the plumbing; they do not validate the estimator against a real bill. Its error messages are its own wording.

<details>
<summary>The stand-in server and client helpers (plumbing, about 200 lines)</summary>

```python
import email.parser
import email.policy
import http.server
import io
import threading
import urllib.error
import urllib.request
import wave

# ---------------------------------------------------------------------------
# A LOCAL STAND-IN that mimics the documented request/response SHAPES.
# The "model" behind it is scripted: it never looks at pixels or listens to
# audio. It validates what arrived, applies the module's own token estimator,
# and returns a canned reply. Error texts are the stand-in's own wording.
# ---------------------------------------------------------------------------
def error_body(message):
    return {"error": {"message": message, "type": "invalid_request_error", "param": None, "code": None}}

AUDIO_FILE_EXTENSIONS = {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"}   # file-transcription guide

def inspect_image(url, model, detail):
    if not url.startswith("data:"):
        return {"source": "url", "tokens": None, "data": None}           # a real server would fetch it
    _, data = parse_data_url(url)                                        # ValueError on bad base64
    info = image_info(data)
    if info["format"] not in SUPPORTED_IMAGE_FORMATS:
        raise ValueError(f"unsupported image format {info['format']!r}; use PNG, JPEG, WEBP or non-animated GIF")
    tokens = image_tokens(info["width"], info["height"], model, detail) if info["width"] else None
    return {"source": "data_url", "tokens": tokens, "data": data, **info}

def inspect_audio(part):
    spec = part["input_audio"]
    if spec["format"] not in AUDIO_IN_FORMATS:
        raise ValueError("input_audio.format must be 'wav' or 'mp3'")
    raw = base64.b64decode(spec["data"], validate=True)
    seconds = None
    if spec["format"] == "wav":
        with wave.open(io.BytesIO(raw)) as w:
            seconds = round(w.getnframes() / w.getframerate(), 3)
    return {"bytes": len(raw), "seconds": seconds}

def half_colours(png_bytes):
    """Average RGB of the left and right half of an RGB PNG (what the scripted 'model' reports)."""
    w, h, rows, _ = parse_png(png_bytes)
    if rows is None:
        return None
    def avg(x0, x1):
        px = [row[x] for row in rows for x in range(x0, x1)]
        return tuple(round(sum(p[i] for p in px) / len(px)) for i in range(3))
    return avg(0, w // 2), avg(w // 2, w)

def tone_wav(seconds=0.2, rate=8000, freq=440.0):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(12000 * math.sin(2 * math.pi * freq * i / rate)))
                               for i in range(int(seconds * rate))))
    return buf.getvalue()

class StandIn(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, token_model="gpt-6-astra", max_body=512 * 1024 * 1024, audio_limit=25_000_000):
        super().__init__(("127.0.0.1", 0), _Handler)       # port 0 = let the OS pick a free port
        self.token_model, self.max_body, self.audio_limit = token_model, max_body, audio_limit

    @property
    def base(self):
        return f"http://127.0.0.1:{self.server_address[1]}"

    def start(self):
        threading.Thread(target=self.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self.shutdown()
        self.server_close()

class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        srv = self.server
        if not self.headers.get("Authorization", "").startswith("Bearer "):
            return self._send(401, error_body("missing bearer token"))
        if len(body) > srv.max_body:
            return self._send(413, error_body(f"request body is {len(body):,} bytes; this stand-in allows {srv.max_body:,}"))
        try:
            if self.path == "/v1/chat/completions":
                return self._send(200, self._chat(json.loads(body)))
            if self.path == "/v1/responses":
                return self._send(200, self._responses(json.loads(body)))
            if self.path == "/v1/audio/transcriptions":
                return self._send(200, self._transcribe(body))
            return self._send(404, error_body("unknown route"))
        except (ValueError, KeyError, ImageRejected, wave.Error) as err:
            return self._send(400, error_body(str(err)))

    # -- shared scripted reply -------------------------------------------------
    def _scripted(self, parts, detail_default="auto"):
        facts, words, tokens = [], 0, 0
        for part in parts:
            kind = part["type"]
            if kind in ("text", "input_text"):
                words += len(part["text"].split())
            elif kind in ("image_url", "input_image"):
                img = part["image_url"]
                url = img["url"] if isinstance(img, dict) else img
                detail = (img.get("detail") if isinstance(img, dict) else part.get("detail")) or detail_default
                got = inspect_image(url, self.server.token_model, detail)
                tokens += got["tokens"] or 0
                if got["data"] and got["format"] == "png":
                    halves = half_colours(got["data"])
                    facts.append(f"a {got['width']}x{got['height']} png (left/right mean RGB: {halves})" if halves
                                 else f"a {got['width']}x{got['height']} png")
                else:
                    facts.append("an image by URL (not fetched by this stand-in)" if got["source"] == "url"
                                 else f"a {got['format']} image")
            elif kind == "input_audio":
                a = inspect_audio(part)
                facts.append(f"{a['bytes']:,} bytes of audio" + (f" = {a['seconds']} s" if a["seconds"] else ""))
        return "(scripted reply) I received: " + "; ".join(facts or ["text only"]) + ".", words + tokens

    def _chat(self, req):
        parts = []
        for msg in req["messages"]:
            content = msg["content"]
            parts += [{"type": "text", "text": content}] if isinstance(content, str) else content
        text, prompt_tokens = self._scripted(parts)
        message = {"role": "assistant", "content": text, "refusal": None}
        if "audio" in req.get("modalities", []):
            if not {"voice", "format"} <= set(req.get("audio") or {}):
                raise ValueError("audio output needs audio.voice and audio.format")
            message["audio"] = {"data": base64.b64encode(tone_wav()).decode()}
        done = len(text.split())
        return {"id": "chatcmpl-standin", "object": "chat.completion", "model": req.get("model"),
                "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": done,
                          "total_tokens": prompt_tokens + done}}

    def _responses(self, req):
        parts = []
        for item in req["input"]:
            parts += item["content"]
        text, tokens_in = self._scripted(parts)
        done = len(text.split())
        return {"id": "resp-standin", "object": "response", "status": "completed",
                "output": [{"type": "message", "role": "assistant", "status": "completed",
                            "content": [{"type": "output_text", "text": text, "annotations": []}]}],
                "usage": {"input_tokens": tokens_in, "output_tokens": done, "total_tokens": tokens_in + done}}

    def _transcribe(self, body):
        head = b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n"
        msg = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(head + body)
        fields, upload = {}, None
        for part in msg.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if part.get_filename():
                upload = (part.get_filename(), part.get_payload(decode=True))
            else:
                fields.setdefault(name, []).append(part.get_content())
        if "model" not in fields or upload is None:
            raise ValueError("a transcription needs 'model' and 'file' form fields")
        filename, data = upload
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext not in AUDIO_FILE_EXTENSIONS:
            raise ValueError(f"unsupported file extension {ext!r}; supported: {sorted(AUDIO_FILE_EXTENSIONS)}")
        if len(data) > self.server.audio_limit:
            raise ValueError(f"file is {len(data):,} bytes; this stand-in's limit is {self.server.audio_limit:,}")
        return {"text": f"(scripted transcript of {len(data):,} bytes of {ext} audio)", "languages": []}

# ---- client helpers (stdlib only) --------------------------------------------
def post_json(base, path, body, key="stand-in-key"):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())

def multipart(fields, files, boundary="----standin-boundary-0001"):
    """Build a multipart/form-data body by hand (urllib has no helper). Returns (content_type, body)."""
    out = []
    for name, value in fields:
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, filename, ctype, data in files:
        out.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                    f'Content-Type: {ctype}\r\n\r\n').encode() + data + b"\r\n")
    out.append(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", b"".join(out)

def post_multipart(base, path, fields, files, key="stand-in-key"):
    ctype, body = multipart(fields, files)
    req = urllib.request.Request(base + path, data=body, method="POST",
                                 headers={"Content-Type": ctype, "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())
```

</details>

The part you would actually write in an application is small: build the body, check it, post it.

```python
import random

def preflight_image(data, detail, model, max_body=512 * 1024 * 1024):
    """Client-side checks that cost nothing: format, patch limit, body size, token estimate."""
    info = image_info(data)
    if info["format"] not in SUPPORTED_IMAGE_FORMATS:
        raise ValueError(f"format {info['format']!r} is not supported")
    b64_chars = 4 * math.ceil(len(data) / 3)
    if b64_chars > max_body:
        raise ValueError(f"base64 payload is {b64_chars:,} bytes, over the {max_body:,} byte request limit")
    tokens = image_tokens(info["width"], info["height"], model, detail) if info["width"] else None
    return {**info, "bytes": len(data), "b64_chars": b64_chars, "tokens": tokens}

def image_question(question, image_url, detail="auto", api="chat"):
    if api == "chat":
        return {"model": MODEL, "max_completion_tokens": 200,
                "messages": [{"role": "user",
                              "content": [text_part(question), image_part(image_url, detail)]}]}
    return {"model": MODEL, "max_output_tokens": 200,
            "input": [{"role": "user", "content": [r_text_part(question), r_image_part(image_url, detail)]}]}

if __name__ == "__main__":
    print("=== 4. an image question, sent to the local stand-in ===")
    srv = StandIn(token_model="gpt-6-astra", max_body=300_000).start()
    try:
        png = make_png(64, 32, lambda x, y: (220, 30, 30) if x < 32 else (30, 30, 220))
        url = to_data_url("image/png", png)
        print("preflight:", preflight_image(png, "high", "gpt-6-astra"))

        body = image_question("Describe the two halves of this image.", url, "high")
        print("\nexact request body (base64 shortened for display):")
        show(body)
        status, resp = post_json(srv.base, "/v1/chat/completions", body)
        print("\nChat Completions ->", status, "|", resp["choices"][0]["message"]["content"])
        print("usage:", resp["usage"], "(the stand-in applies this module's own estimator)")

        status, resp = post_json(srv.base, "/v1/responses", image_question("Same question.", url, "high", api="responses"))
        print("Responses        ->", status, "|", resp["output"][0]["content"][0]["text"][:60], "...")
        print("usage:", resp["usage"])

        status, resp = post_json(srv.base, "/v1/chat/completions",
                                 image_question("What is this?", "https://example.com/cat.png"))
        print("https URL        ->", status, "|", resp["choices"][0]["message"]["content"])

        print("\n--- failure modes ---")
        bmp = b"BM" + bytes(60)
        status, resp = post_json(srv.base, "/v1/chat/completions",
                                 image_question("?", to_data_url("image/bmp", bmp)))
        print("BMP              ->", status, resp["error"]["message"])

        status, resp = post_json(srv.base, "/v1/chat/completions",
                                 image_question("?", "data:image/png;base64,@@@"))
        print("bad base64       ->", status, resp["error"]["message"])

        big = make_gray_png(6000, 6000)                          # a REAL 6000 x 6000 PNG, ~0.04 MB
        big_url = to_data_url("image/png", big)
        print("6000x6000 PNG    :", f"{len(big):,} bytes on disk, but 36,000,000 decoded pixels")
        for detail in ("original", "high"):
            try:
                pf = preflight_image(big, detail, "gpt-6-astra")
                local = f"preflight ok, {pf['tokens']:,} tokens"
            except ImageRejected as err:
                local = f"preflight says: {err}"
            status, resp = post_json(srv.base, "/v1/chat/completions", image_question("?", big_url, detail))
            remote = resp["error"]["message"] if status != 200 else f"{status} prompt_tokens={resp['usage']['prompt_tokens']:,}"
            print(f"  detail={detail:<8} {local}\n  {'':<16} stand-in -> {remote}")

        noise = make_png(300, 300, lambda x, y, r=random.Random(0): tuple(r.randrange(256) for _ in range(3)))
        status, resp = post_json(srv.base, "/v1/chat/completions",
                                 image_question("?", to_data_url("image/png", noise)))
        print(f"incompressible {len(noise):,} byte PNG ->", status, resp["error"]["message"])
        status, resp = post_json(srv.base, "/v1/chat/completions", body, key=None)
        print("no API key       ->", status, resp["error"]["message"])
    finally:
        srv.stop()
```

Output:

```
=== 4. an image question, sent to the local stand-in ===
preflight: {'format': 'png', 'width': 64, 'height': 32, 'bytes': 116, 'b64_chars': 156, 'tokens': 3}

exact request body (base64 shortened for display):
{
  "model": "your-vision-model-id",
  "max_completion_tokens": 200,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe the two halves of this image."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE...<178 chars>",
            "detail": "high"
          }
        }
      ]
    }
  ]
}

Chat Completions -> 200 | (scripted reply) I received: a 64x32 png (left/right mean RGB: ((220, 30, 30), (30, 30, 220))).
usage: {'prompt_tokens': 10, 'completion_tokens': 16, 'total_tokens': 26} (the stand-in applies this module's own estimator)
Responses        -> 200 | (scripted reply) I received: a 64x32 png (left/right mean RG ...
usage: {'input_tokens': 5, 'output_tokens': 16, 'total_tokens': 21}
https URL        -> 200 | (scripted reply) I received: an image by URL (not fetched by this stand-in).

--- failure modes ---
BMP              -> 400 unsupported image format 'bmp'; use PNG, JPEG, WEBP or non-animated GIF
bad base64       -> 400 not a base64 data URL
6000x6000 PNG    : 48,291 bytes on disk, but 36,000,000 decoded pixels
  detail=original preflight says: 35344 patches exceeds the 30000 patch limit; reduce the dimensions
                   stand-in -> 35344 patches exceeds the 30000 patch limit; reduce the dimensions
  detail=high     preflight ok, 3,000 tokens
                   stand-in -> 200 prompt_tokens=3,001
incompressible 270,448 byte PNG -> 413 request body is 360,828 bytes; this stand-in allows 300,000
no API key       -> 401 missing bearer token
```

Things to notice in that output: the body that goes on the wire is ordinary JSON (the base64 is shortened only for display); the Responses spelling of the same question returns `output[0].content[0].text` instead of `choices[0].message.content` and reports `input_tokens` where Chat Completions says `prompt_tokens`; the 6000 × 6000 PNG is only 48,291 bytes on disk but 36 million pixels once decoded, so file size tells you nothing about patch count; and the local pre-flight and the stand-in agree on every rejection, so the cheap check can run before the network call.

### Block 5: audio, from a WAV file to a transcription request

`wave` is in the standard library, so a valid WAV is a few lines. The transcription request is `multipart/form-data`, which `urllib` cannot build for you, so Block 4's `multipart` helper writes the boundaries by hand. The size-limit fix is the useful part: `split_wav` cuts on sample-frame boundaries so every piece is a valid file under the limit. It cannot cut on sentence boundaries, which is what the guide advises where possible, and that needs silence detection (see the Project).

```python
TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "your-transcription-model-id")
CHAT_AUDIO_MODEL = os.environ.get("CHAT_AUDIO_MODEL", "your-audio-chat-model-id")

def wav_info(data):
    with wave.open(io.BytesIO(data)) as w:
        return {"channels": w.getnchannels(), "sample_width": w.getsampwidth(),
                "rate": w.getframerate(), "frames": w.getnframes()}

def split_wav(data, max_bytes):
    """Cut a WAV into pieces of at most max_bytes on sample-frame boundaries (not on sentence boundaries!)."""
    with wave.open(io.BytesIO(data)) as w:
        params, frame_size = w.getparams(), w.getsampwidth() * w.getnchannels()
        frames_per_piece = (max_bytes - 44) // frame_size                  # 44 = canonical WAV header
        pieces = []
        while True:
            chunk = w.readframes(frames_per_piece)
            if not chunk:
                return pieces
            buf = io.BytesIO()
            with wave.open(buf, "wb") as out:
                out.setparams(params)
                out.writeframes(chunk)
            pieces.append(buf.getvalue())

def seconds_per_limit(limit_bytes, rate, channels=1, width=2):
    return limit_bytes / (rate * channels * width)

def audio_chat_request(question, wav_bytes, voice="alloy"):
    """Audio in AND out through Chat Completions: modalities + audio config + an input_audio part."""
    b64 = base64.b64encode(wav_bytes).decode("ascii")
    return {"model": CHAT_AUDIO_MODEL, "modalities": ["text", "audio"],
            "audio": {"voice": voice, "format": "wav"},
            "messages": [{"role": "user", "content": [text_part(question), audio_part(b64, "wav")]}]}

# Constraints copied from the OpenAPI spec's CreateSpeechRequest, checked Oct 2026
SPEECH_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage",
                 "shimmer", "verse", "marin", "cedar"}
SPEECH_FORMATS = {"mp3", "opus", "aac", "flac", "wav", "pcm"}

def speech_request(text, voice, fmt="mp3", speed=1.0):
    if not 1 <= len(text) <= 4096:
        raise ValueError(f"input must be 1-4096 characters, got {len(text)}")
    if voice not in SPEECH_VOICES:
        raise ValueError(f"unknown built-in voice {voice!r}")
    if fmt not in SPEECH_FORMATS or not 0.25 <= speed <= 4.0:
        raise ValueError("bad response_format or speed (0.25-4.0)")
    return {"model": "your-tts-model-id", "input": text, "voice": voice, "response_format": fmt, "speed": speed}

if __name__ == "__main__":
    print("=== 5. audio: chat in/out, file transcription, limits ===")
    wav = tone_wav(seconds=1.0, rate=8000)
    print("WAV:", wav_info(wav), "|", f"{len(wav):,} bytes")
    srv = StandIn(audio_limit=20_000).start()
    try:
        req = audio_chat_request("What is in this recording?", wav)
        status, resp = post_json(srv.base, "/v1/chat/completions", req)
        msg = resp["choices"][0]["message"]
        reply_wav = base64.b64decode(msg["audio"]["data"])
        print("audio chat ->", status, "|", msg["content"])
        print("audio reply is a valid WAV:", wav_info(reply_wav), "(a scripted tone, not speech)")

        status, resp = post_json(srv.base, "/v1/chat/completions",
                                 {**req, "audio": None})
        print("missing audio config ->", status, resp["error"]["message"])

        fields = [("model", TRANSCRIBE_MODEL), ("prompt", "A short test recording.")]
        status, resp = post_multipart(srv.base, "/v1/audio/transcriptions", fields,
                                      [("file", "clip.wav", "audio/wav", wav)])
        print("\ntranscription (1 s, 16,044 bytes) ->", status, resp)
        status, resp = post_multipart(srv.base, "/v1/audio/transcriptions", fields,
                                      [("file", "clip.ogg", "audio/ogg", wav)])
        print("extension .ogg ->", status, resp["error"]["message"])

        long_wav = tone_wav(seconds=3.0, rate=8000)
        status, resp = post_multipart(srv.base, "/v1/audio/transcriptions", fields,
                                      [("file", "long.wav", "audio/wav", long_wav)])
        print(f"\n3 s WAV, {len(long_wav):,} bytes vs a 20,000 byte limit ->", status, resp["error"]["message"])
        pieces = split_wav(long_wav, 20_000)
        total = sum(wav_info(p)["frames"] for p in pieces)
        print("split into", len(pieces), "pieces:", [len(p) for p in pieces],
              "| frames kept:", total, "of", wav_info(long_wav)["frames"])
        texts = []
        for i, p in enumerate(pieces):
            status, resp = post_multipart(srv.base, "/v1/audio/transcriptions", fields,
                                          [("file", f"part{i}.wav", "audio/wav", p)])
            texts.append(resp["text"])
        print("each piece accepted:", len(texts) == len(pieces))
    finally:
        srv.stop()

    print("\nhow much audio fits in a 25,000,000 byte upload (uncompressed PCM WAV):")
    for rate, ch in ((8000, 1), (16000, 1), (24000, 1), (44100, 2)):
        print(f"  {rate:>6} Hz x {ch} ch x 16-bit -> {seconds_per_limit(25_000_000, rate, ch) / 60:6.1f} minutes")

    print("\n--- speech request checks ---")
    print(speech_request("Hello there.", "coral"))
    for bad in (("", "coral"), ("Hi", "robot")):
        try:
            speech_request(*bad)
        except ValueError as err:
            print("rejected:", err)
```

Output:

```
=== 5. audio: chat in/out, file transcription, limits ===
WAV: {'channels': 1, 'sample_width': 2, 'rate': 8000, 'frames': 8000} | 16,044 bytes
audio chat -> 200 | (scripted reply) I received: 16,044 bytes of audio = 1.0 s.
audio reply is a valid WAV: {'channels': 1, 'sample_width': 2, 'rate': 8000, 'frames': 1600} (a scripted tone, not speech)
missing audio config -> 400 audio output needs audio.voice and audio.format

transcription (1 s, 16,044 bytes) -> 200 {'text': '(scripted transcript of 16,044 bytes of wav audio)', 'languages': []}
extension .ogg -> 400 unsupported file extension 'ogg'; supported: ['m4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'wav', 'webm']

3 s WAV, 48,044 bytes vs a 20,000 byte limit -> 400 file is 48,044 bytes; this stand-in's limit is 20,000
split into 3 pieces: [20000, 20000, 8132] | frames kept: 24000 of 24000
each piece accepted: True

how much audio fits in a 25,000,000 byte upload (uncompressed PCM WAV):
    8000 Hz x 1 ch x 16-bit ->   26.0 minutes
   16000 Hz x 1 ch x 16-bit ->   13.0 minutes
   24000 Hz x 1 ch x 16-bit ->    8.7 minutes
   44100 Hz x 2 ch x 16-bit ->    2.4 minutes

--- speech request checks ---
{'model': 'your-tts-model-id', 'input': 'Hello there.', 'voice': 'coral', 'response_format': 'mp3', 'speed': 1.0}
rejected: input must be 1-4096 characters, got 0
rejected: unknown built-in voice 'robot'
```

Three things worth reading in that output. The stand-in's limit was 20,000 bytes rather than 25 MB only so the demonstration stays small; the split arithmetic is the same at any size. The `.ogg` rejection is the stand-in following the *guide's* format list, while the spec lists `ogg`: when two official sources disagree, test with your own file. And the minutes table shows why the limit bites uncompressed audio quickly: 25,000,000 bytes is about 13 minutes of 16 kHz mono 16-bit PCM, but compressed formats stretch it a lot.

### Not executed: the official SDK spelling

Not executed in this module's verification (needs the `openai` package and an API key). Names are from the OpenAI guides fetched for this module; the key comes from the environment, never from source code.

```python
import base64, os
from openai import OpenAI

client = OpenAI()                      # reads OPENAI_API_KEY from the environment

with open("photo.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")

response = client.responses.create(
    model=os.environ["VISION_MODEL"],  # a vision-capable model id, from configuration
    input=[{
        "role": "user",
        "content": [
            {"type": "input_text", "text": "what's in this image?"},
            {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}", "detail": "auto"},
        ],
    }],
)
print(response.output_text)

with open("audio.wav", "rb") as audio_file:
    transcription = client.audio.transcriptions.create(
        model=os.environ["TRANSCRIBE_MODEL"], file=audio_file
    )
print(transcription.text)
```

> [!example] Pre-flight in one line of thought. Before every image request ask four questions that cost nothing: is the format on the list (sniffed, not trusted)? does the base64 body stay under the request limit? are the patches under 30,000 for the detail level I am about to use? does the token estimate fit the budget I set for this call? If any answer is no, fix or downscale on your side. That turns provider errors into a local, explainable decision.

## Visual diagram

```
A multimodal request (Chat Completions spelling)

┌──────────────────────────────────────────────────────────────────────────┐
│ POST /v1/chat/completions                                                │
│ model, max_completion_tokens, [modalities, audio]                        │
│ messages: [                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ role: "user"                                                       │ │
│   │ content: [   <- a LIST of typed parts; order is preserved          │ │
│   │   { type: "text",        text: "What is on this receipt?" }        │ │
│   │   { type: "image_url",   image_url: { url, detail } }              │ │
│   │          url = https://...            (provider fetches it)        │ │
│   │             or data:image/png;base64,... (you send the bytes)      │ │
│   │   { type: "input_audio", input_audio: { data, format } }           │ │
│   │ ]                                                                  │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│ ]                                                                        │
└──────────────────────────────────────────────────────────────────────────┘

From file to bill (images)

 file ──► bytes ──► source ───────► provider ───► resize ───► patches ───► tokens ───► bill
          PNG       https URL        decodes     by model    ceil(w/32)    x model     tokens/1e6
          JPEG      data URL         (rejects    + detail    x ceil(h/32)  multiplier  x price
          WEBP      file id          bad ones)   limits      > 30,000 =                (also counts
          GIF(still)                                          rejected                  toward TPM)
            │            │                            │           │
            └ sniff it   └ +33% size when base64      └ low/high/original/auto; "low" is
              yourself                                  not always the cheapest

Which audio door? (checked Oct 2026)

 a finished recording -> text ......... POST /v1/audio/transcriptions   file <= 25 MB
 live captions / translation .......... Realtime transcription session
 text -> spoken audio ................. POST /v1/audio/speech           input <= 4096 characters
 audio in/out inside a chat app ....... Chat Completions + input_audio   wav | mp3 in, base64 out
 a live, interruptible conversation ... Realtime session (WebRTC | WebSocket | SIP)
```

## Practice

### 1. One image by hand

Using the patch rule (steps A to D) and the first model row of Block 3 (`gpt-6-astra`, multiplier 1.2, `high` allows 2,500 patches), how many patches and tokens does a 1536 × 1024 image cost at `high`? Check with the function.

<details>
<summary>Answer</summary>

`ceil(1536 / 32) = 48` and `ceil(1024 / 32) = 32`, so 48 × 32 = 1,536 patches. That is under the 2,500 budget, so no shrink. `ceil(1536 × 1.2) = ceil(1843.2) = 1844` tokens. Running `patches_for(1536, 1024, "gpt-6-astra", "high")` gives 1536 and `patch_tokens(...)` gives 1844.

</details>

### 2. Which detail level, and why?

A 4000 × 3000 phone photo goes to the first row of Block 3's table. Compute the tokens at `low`, `high` and `original` (use the functions, then explain the ratio). When is `original` worth it?

<details>
<summary>Answer</summary>

`patch_tokens(4000, 3000, "gpt-6-astra", ...)` gives 231 at `low`, 2,942 at `high` and 14,100 at `original`. At `original` the image keeps its size: 125 × 94 = 11,750 patches, times 1.2. At `high` the 2,500-patch budget forces a shrink to 2,451 patches (the formula rounds down to whole patches to stay inside the budget). `original` costs about 4.8x `high` and about 61x `low`. It is worth it when the task needs fine detail or exact coordinates (small print, dense screenshots, computer use), which is the guide's advice; for "what is in this photo" `low` or `high` is enough.

</details>

### 3. Base64 arithmetic

A 3,000,000-byte JPEG is sent as a data URL. How many base64 characters is that? If the request limit were 512,000,000 bytes and you sent nothing but such images, how many fit by size? Which limit binds first, size or the 1,500-image cap?

<details>
<summary>Answer</summary>

`4 × ceil(3,000,000 / 3) = 4,000,000` characters (plus a 22-character `data:image/jpeg;base64,` prefix, which is negligible). `512,000,000 // 4,000,000 = 128` images by size (134 if "512 MB" means 512 × 1024 × 1024 bytes, which the guide does not specify). Size binds long before the 1,500-image cap. If you need more images per request, upload through the Files API or downscale first.

</details>

### 4. How long can the audio be?

The transcription guide caps a file at 25 MB. Treating that as 25,000,000 bytes, how many seconds of 16 kHz mono 16-bit PCM WAV fit? How many minutes of a 64 kbit/s MP3? Why is the conservative reading of "MB" the safe one?

<details>
<summary>Answer</summary>

16 kHz × 1 channel × 2 bytes = 32,000 bytes per second, so 25,000,000 / 32,000 = 781.25 s, about 13.0 minutes (matches the Block 5 table). 64 kbit/s is 8,000 bytes per second, so 25,000,000 / 8,000 = 3,125 s, about 52 minutes. The guide says "25 MB" without saying whether that means 10^6 or 2^20 bytes; planning to the smaller number (25,000,000) means a file that passes your check cannot fail on the provider's. The WAV header adds 44 bytes, so leave a little headroom.

</details>

### 5. Write `choose_detail`

Write `choose_detail(width, height, model, token_budget)` that returns the highest-fidelity detail level whose estimate fits a token budget, or `None`. It must skip levels a model does not offer and levels that would be rejected. Then run it for four image sizes at budgets of 300, 1,500, 5,000 and 15,000 tokens.

<details>
<summary>Answer</summary>

Append this to the lab file (it reuses `image_tokens` and `ImageRejected` from Block 3):

```python
def choose_detail(width, height, model, token_budget):
    """Highest-fidelity detail level whose estimate fits the budget; None if even 'low' does not fit."""
    for detail in ("original", "high", "low"):
        try:
            if image_tokens(width, height, model, detail) <= token_budget:
                return detail
        except ImageRejected:
            continue            # too many patches, or a detail level this model does not offer
    return None

if __name__ == "__main__":
    print("=== 6. choose_detail for gpt-6-astra at budgets of 300 / 1,500 / 5,000 / 15,000 tokens ===")
    for size in ((640, 480), (1920, 1080), (4000, 3000), (6000, 6000)):
        print(f"{size[0]}x{size[1]}", [choose_detail(*size, "gpt-6-astra", b) for b in (300, 1500, 5000, 15000)])
```

Output of that last part:

```
=== 6. choose_detail for gpt-6-astra at budgets of 300 / 1,500 / 5,000 / 15,000 tokens ===
640x480 ['low', 'original', 'original', 'original']
1920x1080 ['low', 'low', 'original', 'original']
4000x3000 ['low', 'low', 'high', 'original']
6000x6000 [None, 'low', 'high', 'high']
```

Read it: a 640 × 480 image fits `original` once the budget reaches 1,500; a 6000 × 6000 image cannot be sent at all with a 300-token budget (even `low` costs 308), returns `None`, and becomes `high` at 5,000. `ImageRejected` covers both reasons a level is unusable: too many patches, and a level the model does not offer (the `gpt-4.1-mini` row has no `original`).

</details>

### Checkpoint quiz

1. Why can't you tell an image's token cost from its file size?
2. Name the three ways to give an image to the API and one risk of each.
3. What is the difference between `image_url` in Chat Completions and in Responses?
4. A request with a 6000 × 6000 image fails at `original` but succeeds at `high`. Why?
5. Which endpoint do you use for a 40 MB recording, and what do you do first?

<details>
<summary>Answers</summary>

1. Tokens come from the decoded pixel dimensions after resizing (patches or tiles), not from the compressed bytes. A flat 6000 × 6000 PNG is under 50 KB yet needs 35,344 patches uncapped.
2. URL: the provider must fetch it and it can change or disappear. Data URL: the request grows by about a third and the payload leaks into logs. File ID: an extra upload step and stored data you must delete or let expire.
3. Chat Completions nests it: `{"type": "image_url", "image_url": {"url": ..., "detail": ...}}`. Responses uses `{"type": "input_image", "image_url": "<string>", "detail": ...}` and also accepts `file_id`.
4. `original` keeps the image's size, so it needs 35,344 patches, over the 30,000-patch limit, and the request is rejected rather than resized. `high` applies a patch budget (2,500 on the first row of the table) and shrinks the image first.
5. `POST /v1/audio/transcriptions`, which accepts up to 25 MB per file. First compress the audio or split it into pieces under the limit, ideally at pauses, then transcribe each piece and join the text.

</details>

> [!check]
> - I can build the same multimodal message in the Chat Completions and Responses spellings
> - I can compute image input tokens from the patch and tile rules, and I know the table is dated configuration
> - I can explain why `low` detail is not always the cheapest option
> - I can build a PNG with `struct` and `zlib` and prove a data URL round-trips
> - I can name the audio endpoints, their size and format limits, and what to do with a file that is too large
> - I know what the data-controls page says about image and audio retention and where it is not enough
> - I check format, size, patch count and token budget before sending, not after an error

## Project

**Build a media pre-flight tool.** A small command-line program (standard library only, no network) that a team could run in CI or before a batch job. Do not look for a reference solution; the module's blocks give you the pieces, the design is yours.

Requirements:

1. Input: a folder of image and audio files plus a JSON config with the model's detail rules and multipliers (as data, not code), a price per million tokens, a per-request token budget, a per-request body limit and the audio file limit.
2. For every image: sniff the real format, read its dimensions, reject unsupported formats and mismatches between extension and content, compute patches, token estimate and cost at a detail level your policy picks (reuse the idea of `choose_detail`), and report the base64 size.
3. For every audio file: read duration and sample rate, flag files over the limit, and write a split plan (sample-frame boundaries are enough; bonus if you find the quietest moment near each cut using the sample values).
4. Pack images into requests that respect both the token budget and the body limit (a greedy first-fit is fine; say what it does not optimise).
5. Output a JSON report and a human summary: per-file verdict with the reason, total tokens, total cost at the configured price, and the number of requests.
6. Test it with generated files only: images from your own PNG builder (including a flat 6000 × 6000 one), a fake BMP, a truncated PNG, WAV files made with `wave`. Include a test that a corrupted PNG is reported rather than crashing the run.

Stretch: add JPEG and WEBP dimension readers, a config-driven second model family, and a `--compare` mode that prints the token difference between two detail policies for the whole folder.

## Interview questions

> [!interview] Your team added screenshots to a support assistant and the monthly bill is three times the forecast. Walk me through how you find out why and what you change.

<details>
<summary>What a strong answer covers</summary>

- Start from data, not guesses: log the `usage` object of every request (input tokens per call), then split input tokens into text and image by comparing with a text-only baseline.
- Likely causes: a high-fidelity detail level on large screenshots, several images per request, resent conversation history that carries old images, retries that repeat a costly request.
- Reconcile with an estimator built from the provider's published rules, knowing it can be off by one token and that the table is per model, so a model upgrade can change the cost of the same image.
- Fixes in order of leverage: downscale or crop before upload, pick the detail level per task, drop old images from history, send fewer images, use a cheaper model where quality allows, set a per-request token budget enforced by pre-flight.
- Mentions that `low` is not always cheaper and that the answer depends on the model's row.

</details>

> [!interview] Image URL, base64 data URL, or uploaded file ID: how do you choose?

<details>
<summary>What a strong answer covers</summary>

- URL: smallest request, but the provider fetches it, so it must be reachable and stable, you cannot guarantee what bytes they saw, and the URL itself is shared with the provider.
- Data URL: self-contained and validated by you; about 33% larger on the wire; counts toward the request-size limit; keep it out of logs.
- File ID: upload once, reuse; stored on the provider until deleted or expired, so it is a retention decision.
- Ties the choice to privacy (private images should not be placed at public URLs), reuse (the same image many times), and size (many large images push you toward uploads).
- Notes the API-specific detail: Chat Completions image parts take a URL string; file IDs belong to the Responses spelling.

</details>

> [!interview] Design a feature that transcribes customer calls of up to two hours and extracts action items. What do you worry about?

<details>
<summary>What a strong answer covers</summary>

- The file limit (25 MB per file in the guide): compress or split; split near silence rather than mid-sentence, and carry some context forward (the guide mentions prompting with the previous chunk's text).
- File transcription versus a live session: a recorded call is a file job; a live agent assist feature is a Realtime transcription session.
- Privacy and consent: call recording laws, retention at the provider (the data-controls table), redaction of card numbers and personal data before the text goes to a second model, encryption and access control for the stored audio.
- Model and deprecation risk: model IDs in configuration, a smoke test, and a plan for the shutdown dates the docs publish.
- Verification: transcripts have errors, so action items should link back to timestamps or snippets, and critical values (amounts, dates) should be confirmable.

</details>

## Common mistakes & troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `bad CRC` or a decode error on a PNG you built | the CRC covers the tag and the data, not the length | compute `zlib.crc32(tag + data)` and pack it big-endian (`>I`) |
| the data URL "works" locally but the provider says the image is invalid | base64 wrapped across lines, or `urlsafe` alphabet, or a stray `data:` prefix inside the payload | encode with `base64.b64encode` (no newlines), validate with `b64decode(..., validate=True)` |
| tokens differ by 1 from your estimate | the guide says floating-point rounding in billing can do this | accept an off-by-one tolerance; use `Fraction` for the multiplier as Block 3 does |
| your estimator is right for one model and wrong for the next | rules and multipliers are per model | key the table by model ID, refresh from the guide, compare with `usage` |
| `multipart` upload rejected | missing `filename` in the file part's `Content-Disposition`, or a wrong boundary line | the file part needs `name="file"; filename="clip.wav"`; the body ends with `--boundary--` |
| the transcript misses the end of a split recording | the cut landed mid-word | cut at silence, and overlap a second or two between pieces |

## Further reading & sources

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) - the guide this module quotes: input sources, the `detail` levels, the model sizing table, the patch and tile token formulas and the limitations list.
- [Audio in Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions) - the `modalities`, `audio` and `input_audio` shapes used in Block 5.
- [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text) - the 25 MB limit, supported formats, streaming events and the deprecation dates.
- [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech) - voices, output formats, the AI-disclosure requirement and the deprecation notice.
- [Getting started with the Realtime API](https://developers.openai.com/api/docs/guides/realtime) - the session-based speech-to-speech interface and its WebRTC, WebSocket and client-secret flow.
- [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data) - retention by endpoint, zero data retention, and the exception for image and file inputs.
- [openai/openai-openapi](https://github.com/openai/openai-openapi) - the published OpenAPI spec; this module read the content-part, transcription and speech schemas from it.
- [Portable Network Graphics (PNG) Specification (Third Edition)](https://www.w3.org/TR/png-3/) - the chunk layout, CRC and filter bytes Block 2 implements.

## Next

[Module 10: The Anthropic Claude API](../10-the-anthropic-claude-api/README.md) takes the same ideas (typed content blocks, images, a tool loop) to a second provider with a different request shape, and gives you the side-by-side table.
