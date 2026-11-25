# Track: Storage

Object, block and file storage, tiers, IOPS, backups, archival and the storage choices that show up in specialized designs.

Part of **Phase 6** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Object Storage Fundamentals: Buckets, Keys and Eleven Nines (S3, Blob)](01-object-storage-fundamentals/README.md) | Explain flat key-value object stores, erasure coding, and 11-nines durability | **Live** |
| 02 | [Block Storage vs File Storage: EBS, EFS, NFS, IOPS and Throughput](02-block-storage-vs-file-storage/README.md) | Choose between low-latency block (EBS), shared POSIX file (EFS/NFS), and object storage | **Live** |
| 03 | [Blob Storage Patterns: Hot, Cool & Archive Tiers, Versioning, WORM](03-blob-storage-patterns/README.md) | Optimize storage cost across Hot/Cool/Archive tiers and enforce WORM compliance locks | **Live** |
| 04 | [File Upload Architecture: Direct Uploads, Virus Scanning & Events](04-file-upload-architecture/README.md) | Offload binary payloads from API servers using direct-to-object uploads and async scanning | **Live** |
| 05 | [Pre-Signed URLs & SAS Tokens: How They Work and Their Risks](05-pre-signed-urls-sas-tokens/README.md) | Mint least-privilege, short-lived SigV4 pre-signed URLs and Azure SAS tokens safely | **Live** |
| 06 | [Multipart & Resumable Uploads: Parts, Retries and tus](06-multipart-resumable-uploads/README.md) | Scale multi-GB uploads with parallel multipart chunks, ETags, and resumable `tus` protocols | **Live** |
| 07 | [File Metadata Storage: DB vs Object Store, Checksums, Hashes](07-file-metadata-storage/README.md) | Pair relational metadata with immutable object keys and end-to-end SHA-256/CRC32C checksums | **Live** |
| 08 | [Chunking & Deduplication: Rolling Hashes and Delta Sync](08-chunking-deduplication/README.md) | Cut bandwidth and storage with Content-Defined Chunking (FastCDC) and delta sync | **Live** |
| 09 | [Image Processing Pipelines: Thumbnails, WebP, AVIF, On-Demand](09-image-processing-pipelines/README.md) | Build safe on-demand image resizing and WebP/AVIF transcoding pipelines behind CDNs | **Live** |
| 10 | [Video Streaming: Transcoding, HLS, DASH & Adaptive Bitrate](10-video-streaming/README.md) | Architect ABR video ingestion, segmented HLS/DASH encoding ladders, and CDN delivery | **Live** |
| 11 | [CDN for Private Content: Signed Cookies, Cache Keys, Shielding](11-cdn-for-private-content/README.md) | Serve private media at the edge with signed cookies, Origin Shield, and normalized cache keys | **Live** |
| 12 | [Data Lifecycle Management: Rules, Retention & Legal Hold](12-data-lifecycle-management/README.md) | Automate storage tier transitions, TTL expiration, and litigation legal holds | **Live** |
| 13 | [Backup vs Archival: Glacier Tiers, WORM Locks & Cross-Region Copies](13-backup-vs-archival/README.md) | Separate operational RPO/RTO backups from long-term immutable regulatory archives | **Live** |

Start here → [Object Storage Fundamentals: Buckets, Keys and Eleven Nines (S3, Blob)](01-object-storage-fundamentals/README.md)

Back to the course index: [../README.md](../README.md)
