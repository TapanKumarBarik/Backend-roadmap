# Module 09: Object Storage and Large Files

## Why this matters

Sooner or later your application has to handle a *big* piece of data — a
user's profile video, a 200MB CSV export, a batch of high-resolution photos, a
signed PDF contract. The instinct of a lot of engineers is to treat it like
any other field: accept the upload in a request handler, read it into memory,
and stash the bytes in a database column. Every part of that instinct is a
trap. Reading a 2GB upload into memory OOM-kills your process. Storing blobs in
your relational database bloats it, wrecks backup/restore times, blows out
your row and buffer caches, and makes every query slower. Proxying gigabytes
through your API server ties up workers and bandwidth for the entire transfer.

The correct architecture separates three concerns that beginners conflate:
**where the bytes live** (object storage, not your database), **how the bytes
move** (streamed/chunked, or directly between client and storage, never buffered
whole in your API), and **what your database stores** (a small pointer — a key
and some metadata — not the blob). Get this right and a 5GB upload costs your
API server almost nothing; get it wrong and a handful of large files can take
the whole service down.

This is also the last building block before the capstone, which has a user
upload a file that then kicks off the entire background-processing pipeline
you've built all track. So this module is both "handle big files correctly"
and "produce the trigger that the rest of the system reacts to."

## Concepts

### Object storage vs. a database (and a filesystem)

**Object storage** (Amazon S3, Google Cloud Storage, Azure Blob Storage, and
the S3-compatible MinIO you can run locally) is purpose-built for storing large,
unstructured blobs. Its model is deliberately simple: a flat namespace of
**buckets**, each holding **objects** identified by a **key** (a string that
looks like a path, `uploads/2026/07/user42/video.mp4`, but is really just a
name). Each object is opaque bytes plus metadata. You get objects by key, put
objects by key, and that's largely it — no queries, no joins, no partial-field
updates.

Why it beats the alternatives for blobs:

- **vs. a relational database:** databases are optimized for structured, queried,
  transactional rows — not multi-gigabyte blobs. Blobs in the DB bloat storage,
  slow backups/restores dramatically, pollute caches, and there's no upside since
  you never query *into* a video. Object storage scales to effectively unlimited
  size cheaply, serves bytes over HTTP, and offloads the transfer entirely.
- **vs. a local filesystem on your app server:** local files don't survive the
  server being replaced (and in containers/autoscaling, servers are cattle),
  don't share across multiple app instances, and don't scale. Object storage is
  durable, replicated, and shared by design.

The golden rule: **the blob goes in object storage; the database stores a
pointer** (the bucket + key, plus metadata like size, content-type, owner,
upload status). Your row is tiny and fast; the bytes live where bytes belong.

### Streaming, not buffering: never load the whole file into memory

A large file must move through your system in **chunks**, never as one giant
in-memory buffer. Two directions:

- **Upload:** read the incoming request body in chunks and write each chunk out
  (to storage) as it arrives, so memory usage stays flat regardless of file
  size. FastAPI's `UploadFile` is spooled (small files in memory, large files
  to a temp file) and exposes an async `.read(size)` you loop over — don't call
  `.read()` with no argument on a huge upload, which reads it all at once.
- **Download:** stream the object back to the client in chunks with a
  `StreamingResponse` (and ideally support HTTP `Range` requests so a client can
  resume or seek), rather than reading the whole object into memory and
  returning it in one shot.

The mental test: could your endpoint handle a file larger than your server's
RAM? With chunked streaming, yes. With `data = await file.read()` followed by
storing `data`, no — you're one big upload away from an out-of-memory crash.

### Multipart form uploads in FastAPI

Browser file uploads arrive as `multipart/form-data` (the encoding you met in
track 02) — a body that can carry file parts plus regular form fields. FastAPI
parses it when you declare an `UploadFile` parameter:

```python
from fastapi import FastAPI, UploadFile, File

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    key = f"uploads/{file.filename}"
    # stream the incoming file to storage in chunks -- flat memory use
    while chunk := await file.read(1024 * 1024):     # 1 MiB at a time
        storage_write(key, chunk)                    # append/multipart-put
    return {"key": key, "content_type": file.content_type}
```

Note two different "multiparts" that share a name but aren't the same thing:
`multipart/form-data` is the *HTTP body encoding* for form uploads; **S3
multipart upload** (below) is a *storage API feature* for uploading one large
object in parts. They co-occur but solve different problems.

### S3 multipart upload for very large objects

Object stores let you upload a single large object as multiple **parts** that
they reassemble server-side: you *initiate* a multipart upload (get an upload
ID), *upload* each part independently (each gets an ETag), and *complete* it
with the list of parts. This gives you parallel part uploads, resumability (re-
upload just a failed part instead of the whole file), and the ability to upload
objects larger than a single request comfortably allows. For modest files a
single `put_object` is simpler; reach for multipart upload when files are large
(commonly hundreds of MB and up) or when resumable/parallel upload matters.

### Presigned URLs: get your API out of the byte path entirely

The most important scaling idea in this module. Even with chunked streaming,
routing every byte *through* your API server wastes its bandwidth and workers on
pure data shoveling. A **presigned URL** eliminates that: your API asks the
object store to generate a temporary, cryptographically-signed URL that grants
permission to `PUT` (upload) or `GET` (download) *one specific object* for a
short time — and hands that URL to the client. The client then uploads/downloads
**directly to/from the object store**, never touching your API for the actual
bytes.

```
Upload with a presigned URL:
  1. client -> API:      "I want to upload profile.mp4"
  2. API   -> client:    presigned PUT URL (valid 15 min, for key uploads/…/profile.mp4)
  3. client -> S3:       PUT the bytes directly to that URL   (API not involved)
  4. client -> API:      "done"  ->  API records the pointer / enqueues processing
```

The benefits: your API never buffers or proxies the file, so it stays fast and
cheap no matter the file size; the object store handles the heavy transfer; and
the URL's short expiry + object-specific scope limits the blast radius if it
leaks. Presigned URLs are how "upload directly to S3 from the browser" works
everywhere. The tradeoff is that you must design the flow so your backend still
learns the upload happened (a completion callback from the client, or an
object-created event/webhook from the store) to record the pointer and trigger
downstream work.

### Tying it back to the pipeline: upload → event → background work

An upload is rarely the end — it's a *trigger*. Once bytes land in storage, you
typically want to process them (transcode, scan for viruses, extract text,
generate thumbnails), and that processing is slow background work. So the clean
pattern is: client uploads (ideally via presigned URL) → your backend records
the object key and enqueues a Celery task keyed by that object → the task reads
the object *from storage* (not from a request), does the work, writes results
back to storage, and signals completion (webhook + real-time push + email —
everything from earlier modules). Notice the task takes the *key*, not the
bytes — "pass IDs, not objects" from module 00, applied to files.

## Command reference

Using `boto3` against S3 / MinIO (S3-compatible), and FastAPI for transfer:

| Concern | API |
|---|---|
| Small upload to storage | `s3.put_object(Bucket=, Key=, Body=)` |
| Download object | `s3.get_object(Bucket=, Key=)["Body"]` (a stream) |
| Presigned upload URL | `s3.generate_presigned_url("put_object", Params={...}, ExpiresIn=)` |
| Presigned download URL | `s3.generate_presigned_url("get_object", Params={...}, ExpiresIn=)` |
| Start multipart upload | `s3.create_multipart_upload(...)` → `UploadId` |
| Upload a part | `s3.upload_part(..., PartNumber=, UploadId=)` → `ETag` |
| Finish multipart | `s3.complete_multipart_upload(..., MultipartUpload={"Parts": [...]})` |
| Receive form upload | `UploadFile = File(...)`, loop `await file.read(size)` |
| Stream a download | `StreamingResponse(iter_chunks(), media_type=...)` |
| Range/resumable download | honor the `Range` request header; return `206 Partial Content` |

Run S3-compatible storage locally with MinIO:

```bash
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin -e MINIO_ROOT_PASSWORD=password \
  minio/minio server /data --console-address ":9001"
# S3 API on :9000, web console on :9001
```

Streamed upload → storage, and a presigned-URL flow — `files.py`:

```python
import boto3
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse

app = FastAPI()
s3 = boto3.client("s3", endpoint_url="http://localhost:9000",
                  aws_access_key_id="admin", aws_secret_access_key="password")
BUCKET = "uploads"

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    key = f"uploads/{file.filename}"
    # Stream to storage in chunks: memory stays flat for any file size.
    s3.upload_fileobj(file.file, BUCKET, key)   # boto3 streams under the hood
    record_pointer(key, file.content_type)      # DB stores the POINTER, not bytes
    process_upload.delay(key)                    # trigger background work by KEY
    return {"key": key}

@app.get("/presign-upload")
def presign_upload(filename: str):
    key = f"uploads/{filename}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=900,                           # 15 minutes
    )
    # Client PUTs the bytes straight to `url` -- API never sees them.
    return {"upload_url": url, "key": key}

@app.post("/uploads/{key:path}/complete")
def complete(key: str):
    # Client tells us the direct-to-S3 upload finished; now we react.
    record_pointer(key, guess_content_type(key))
    process_upload.delay(key)
    return {"status": "processing"}

@app.get("/download/{key:path}")
def download(key: str):
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    # Stream the object body straight through -- no full-file buffering.
    return StreamingResponse(obj["Body"].iter_chunks(chunk_size=1024 * 1024),
                             media_type=obj["ContentType"])

@app.get("/presign-download/{key:path}")
def presign_download(key: str):
    url = s3.generate_presigned_url("get_object",
                                    Params={"Bucket": BUCKET, "Key": key},
                                    ExpiresIn=300)
    return {"download_url": url}       # client GETs bytes directly from S3
```

The processing task takes the key, reads from storage:

```python
@celery.task(bind=True, autoretry_for=(Exception,), max_retries=3, retry_backoff=True)
def process_upload(self, key):
    obj = s3.get_object(Bucket=BUCKET, Key=key)     # read bytes from storage, not a request
    result_key = transcode_stream(obj["Body"], key)  # stream in, stream out
    s3.put_object(Bucket=BUCKET, Key=result_key, Body=...)  # write result back to storage
    mark_done(key, result_key)
    return result_key
```

## Hands-on exercises

Continue in `bg-queues`. `pip install boto3`. Start MinIO (above), and create
the bucket: `docker exec minio mc mb /data/uploads` or via the console at
`localhost:9001`.

### 1. Store a pointer, not the blob

Upload a small file with `/upload`. Then inspect what your "database" recorded
(`record_pointer`) versus what's in MinIO. Expected: the DB row holds only the
key + content-type + size (a few bytes of metadata); the actual file bytes live
in the `uploads` bucket. Articulate why putting the bytes in the DB row instead
would be a mistake.

### 2. Stream an upload without buffering it

Upload a large file (make one: `head -c 500M /dev/urandom > big.bin`) via
`upload_fileobj`. Watch your API process's memory (Task Manager / `ps`).
Expected: memory stays roughly flat — the file streamed through in chunks.
Now write a *broken* version that does `data = await file.read()` then
`put_object(Body=data)` and upload the same file. Expected: memory spikes by
~the file size. Lesson: `read()`-it-all doesn't scale; stream.

### 3. Stream a download

Download the 500MB object through `/download/{key}` with
`curl -o out.bin http://localhost:8000/download/uploads/big.bin`. Watch API
memory. Expected: flat memory again — the `StreamingResponse` pipes chunks
through without buffering the whole object. Confirm `out.bin` matches the
original (`sha256sum`).

### 4. Presigned upload URL: get the API out of the byte path

Call `/presign-upload?filename=direct.bin` to get a URL, then upload straight to
it with `curl`:

```bash
curl -X PUT --upload-file big.bin "<upload_url>"
```

Watch your API process during the upload. Expected: your API's memory and CPU
barely move — the bytes went from `curl` directly to MinIO; your API only
issued a signed URL. Then confirm the object exists in the bucket. This is the
scaling superpower of presigned URLs.

### 5. Presigned download URL

Call `/presign-download/uploads/direct.bin`, then `curl` the returned URL
directly. Expected: you download the bytes straight from MinIO, no API
involvement in the transfer. Wait past `ExpiresIn` and retry the same URL.
Expected: it's now rejected (expired) — the short TTL limits exposure.

### 6. Upload-then-trigger the pipeline

Wire `/upload` (or `/complete` for the presigned flow) to
`process_upload.delay(key)`. Upload a file and watch a Celery worker pick up the
task. Expected: the task runs *after* the response returned, reads the object
*from storage by key* (not from any request), and writes a result object back.
The upload was the trigger; the work happened in the background.

### 7. S3 multipart upload for a large object

Use `create_multipart_upload` / `upload_part` / `complete_multipart_upload` to
upload `big.bin` in, say, 5 parts. Expected: five parts, each with an ETag,
reassembled into one object on `complete`. Then simulate a failed part (skip
one) and observe `complete` rejects an incomplete part list — you'd re-upload
just that part, not the whole file. Lesson: multipart buys resumability and
parallelism for big objects.

### 8. Range request / resumable download

Request bytes 0-1023 with `curl -r 0-1023 http://localhost:8000/download/...`
(after adding `Range` handling that returns `206 Partial Content`). Expected: a
`206` with just that byte range. This is what lets clients resume interrupted
downloads and video players seek. Confirm a full request still returns `200`.

### 9. Diagnose and fix: the API that falls over on big uploads

An endpoint works in testing but the API OOM-crashes whenever a few users
upload large files at once, and each upload pins a worker for its whole
duration. The code:

```python
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()                 # entire file into memory
    db.execute("INSERT INTO files(name, blob) VALUES (?, ?)",
               (file.filename, data))        # blob stored IN the database
    return {"ok": True}
```

Identify all three problems (whole file in memory; blob in the DB; the API
proxying/holding the entire transfer) and rewrite it correctly.

<details>
<summary>Solution</summary>

Three distinct problems:

1. **`await file.read()` loads the entire file into memory** — a few concurrent
   large uploads exhaust RAM and OOM-kill the process.
2. **The blob is stored in the database** — bloating it, wrecking backup/restore
   and cache behavior, with zero query benefit.
3. **Every byte is proxied through the API for the whole transfer** — a large
   upload pins a worker and consumes API bandwidth for its entire duration.

Corrected — stream to object storage and store only a pointer, and for real
scale, get the API out of the byte path with a presigned URL:

```python
# Option A: stream through the API to storage (flat memory, but still proxies)
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    key = f"uploads/{file.filename}"
    s3.upload_fileobj(file.file, BUCKET, key)      # streamed, not buffered
    record_pointer(key, file.content_type)          # DB stores a pointer only
    process_upload.delay(key)
    return {"key": key}

# Option B (best at scale): presigned URL -- client uploads DIRECTLY to storage
@app.get("/presign-upload")
def presign_upload(filename: str):
    key = f"uploads/{filename}"
    url = s3.generate_presigned_url("put_object",
              Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=900)
    return {"upload_url": url, "key": key}
# ... then a /complete endpoint records the pointer and enqueues processing.
```

Option A fixes problems 1 and 2 (flat memory, blob in object storage, pointer
in DB). Option B additionally fixes 3 — the bytes never traverse your API at
all, so file size stops mattering to your server. Either way the DB holds only
a small pointer and the blob lives in object storage.

</details>

## Independent challenge

No code given. Build a document-upload service that (1) issues a presigned URL
so clients upload large files directly to object storage without proxying bytes
through your API, (2) on upload completion records only a pointer + metadata in
your database and enqueues a background task keyed by the object key, (3) has
that task read the object *from storage* (never from a request), extract its
text, and write the extracted text back to storage as a new object, and (4)
serves downloads via short-lived presigned GET URLs. Prove that your API
process's memory and CPU stay flat even while a multi-gigabyte file is being
uploaded and downloaded, and that your database never contains file bytes.

The task-takes-a-key-not-bytes design is "pass IDs, not objects" from
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md); the
extraction task should retry transient storage errors idempotently per
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md).

<details>
<summary>Hint</summary>

The flow is `GET /presign-upload → client PUTs to S3 → POST /complete (records
pointer, enqueues extract.delay(key)) → extract reads key from S3, writes
{key}.txt back → GET /presign-download/{key}.txt`. Prove flat API resource use
by uploading/downloading directly against the presigned URLs and watching your
API process do nothing during the transfer. Idempotency: derive the output key
deterministically from the input key and skip if it already exists, so a retry
doesn't re-extract.

</details>

## Common mistakes & troubleshooting

- **Storing blobs in the database.** Bloats storage, cripples backup/restore,
  pollutes caches, and buys nothing. Put bytes in object storage; store a
  pointer (bucket + key + metadata) in the DB.
- **Reading the whole file into memory (`await file.read()`).** A few
  concurrent large uploads OOM your process. Stream in chunks
  (`upload_fileobj` / loop `read(size)`).
- **Buffering whole objects on download.** Same memory problem in reverse. Use
  `StreamingResponse` and support `Range` requests.
- **Proxying every byte through your API.** Even streamed, this wastes API
  bandwidth and pins workers for the transfer. Use presigned URLs so clients
  transfer directly to/from storage.
- **Passing file bytes to a task.** Huge, slow-to-serialize messages and stale
  data. Pass the object *key*; let the task read from storage.
- **Long-lived or over-broad presigned URLs.** A URL valid for days or for a
  whole bucket is a leak risk. Scope to one object and a short expiry.
- **Forgetting the backend must learn the upload happened.** With direct-to-
  storage uploads, add a completion callback or object-created event so you
  record the pointer and trigger downstream work.
- **Storing files on the local app-server filesystem.** They don't survive
  instance replacement, don't share across instances, and don't scale. Use
  object storage.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why shouldn't large files be stored in your relational database, and what
   should the database store instead?
2. What's the memory-behavior difference between `await file.read()` then
   storing the result, versus streaming with `upload_fileobj` / chunked reads?
3. What is a presigned URL, and what problem does it solve that even correct
   chunked streaming through your API does not?
4. Name two properties of a presigned URL that limit the damage if one leaks.
5. Distinguish `multipart/form-data` from an S3 multipart upload — what does
   each one actually do?
6. Why does the background processing task take the object *key* rather than the
   file bytes?
7. With direct-to-storage (presigned) uploads, how does your backend find out
   the upload finished so it can record the pointer and start processing?

<details>
<summary>Answers</summary>

1. Databases are built for structured, queried, transactional rows, not
   multi-gigabyte blobs; blobs bloat storage, drastically slow backup/restore,
   pollute caches, and offer no query benefit. The database should store a small
   pointer — the bucket + object key plus metadata (size, content-type, owner,
   status) — while the bytes live in object storage.
2. `await file.read()` loads the entire file into memory at once, so concurrent
   large uploads exhaust RAM and can OOM-crash the process. Streaming with
   `upload_fileobj`/chunked reads moves the file through in small pieces, so
   memory usage stays roughly flat regardless of file size.
3. A presigned URL is a temporary, signed URL from the object store granting
   permission to PUT or GET one specific object for a short time; the client
   uploads/downloads directly to/from storage. It solves byte-proxying: even
   correct chunked streaming still routes every byte through your API, consuming
   its bandwidth and pinning workers for the whole transfer, whereas a presigned
   URL keeps the API entirely out of the data path.
4. It's scoped to a single object (one key/operation) and it expires quickly
   (short TTL), so a leaked URL grants only limited, time-boxed access to one
   object rather than broad or lasting access.
5. `multipart/form-data` is the HTTP request-body *encoding* browsers use to
   submit file uploads (and form fields) — parsed by FastAPI via `UploadFile`.
   An S3 multipart upload is a *storage API feature* for uploading one large
   object as several independently-uploaded parts the store reassembles,
   enabling parallel/resumable uploads of big objects. Different layers,
   similar name.
6. Because passing the bytes would create a huge, slow-to-serialize message on
   the broker and could carry stale data; passing the key ("pass IDs, not
   objects") keeps the message tiny and lets the task read the current bytes
   directly from storage at execution time.
7. The client (or the object store) notifies the backend — e.g. the client
   calls a `/complete` endpoint after its direct PUT succeeds, or the store
   emits an object-created event/webhook. That notification is when the backend
   records the pointer and enqueues the processing task.

</details>

## Next

[10-capstone-project](../10-capstone-project/README.md) — everything converges.
You'll build a service where uploading a file (this module) triggers background
processing (modules 00-02) that fires a webhook (modules 05-06), pushes live
progress to the uploader over a real-time connection (module 07), and sends a
completion email (module 04) — with retries, idempotency, and clean connection
handling throughout.
