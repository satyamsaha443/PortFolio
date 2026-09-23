# Handling Large Files: Object Storage, Presigned URLs, and CDNs

> **Lesson 9.4** · All levels · 30 min

---

Large files strain a design in ways ordinary records do not. Take a 2 GB video sent as a normal `POST` to an application server that then stores it. That path breaks three ways at once:

1. **Memory exhaustion** — the app server must hold the upload in memory or a temp file while it streams in, so a few concurrent 2 GB uploads exhaust one instance's memory and bandwidth.
2. **Timeout** — the request runs for minutes, past most gateway and proxy timeouts (30–60 s), and a dropped connection near the end wastes the whole transfer.
3. **Database bloat** — storing bytes in a database column means every backup, table scan, and cache drags gigabytes of binary data that no query ever filters on.

---

## The Core Split: Bytes in Object Storage, Pointer in the Database

A database is built for small structured rows, not multi-gigabyte blobs. **Separate the two concerns:**

- **Raw bytes** go into **object storage** — a flat store built to hold large objects cheaply and durably (S3, GCS, Azure Blob).
- **The database keeps only a small row** that points to the object.

> **Object key** — The identifier for one object in the store, like a file path: `uploads/2026/u42/a8f3c1.mp4`. The database row holds this string, not the bytes. Reading the file means fetching the object by its key.

```
videos table:
┌─────────┬────────────────────────────────┬────────────────┬──────────┐
│ id      │ object_key                     │ owner_id       │ status   │
├─────────┼────────────────────────────────┼────────────────┼──────────┤
│ v_abc   │ uploads/2026/u42/a8f3c1.mp4   │ u42            │ ready    │
└─────────┴────────────────────────────────┴────────────────┴──────────┘
```

The metadata row stays tiny no matter how large the file. It carries the owner, object key, content type, byte size, and a status: `pending → processing → ready`. A query like "list this user's videos, newest first" scans small rows and never touches the blobs.

**The dotted line is the whole idea:** the small row references the large object by key, and the bytes never live in the database. The database stays fast while files grow without bound.

---

## Uploads: Split the File Into Parts

A single 2 GB upload is fragile — one network blip at 90% forces the client to start over. Object stores solve this with **multipart upload**: the client splits the file into parts and uploads each part independently.

```
Client → InitiateMultipartUpload → upload_id
Client → UploadPart(1) ──→ object store (parallel)
Client → UploadPart(2) ──→ object store (parallel)
Client → UploadPart(3) ──→ object store (parallel)
Client → CompleteMultipartUpload(upload_id, [part1_etag, part2_etag, ...])
Object store → assembles into one object
```

Benefits:
- A failed part is retried alone, not the whole file.
- Parts upload in parallel to use more bandwidth.
- The transfer can pause and resume across network changes.

**Threshold:** Multipart carries overhead (a start call, one call per part, a complete call). A 200 KB avatar goes up in a single PUT; a 2 GB video is worth chunking.

---

## Presigned URLs: The Client Uploads Directly to Storage

Splitting the file helps, but the bytes should **never pass through the app server**. The mechanism that keeps them off it is the **presigned URL**.

> **Presigned URL** — A URL the app server generates by signing a specific request with its storage credentials. The signature encodes one operation on one object key, plus an expiry (minutes). The object store trusts the signature, so the holder can perform exactly that operation without any credentials of their own.

**The flow inverts the naive upload:**

```
1. Client → POST /api/videos/upload-url
2. Server → checks authorization, writes status=pending row
3. Server → generates presigned URL for PUT to uploads/u42/a8f3c1.mp4
4. Server → 200 { "upload_url": "https://s3.../a8f3c1.mp4?X-Amz-Signature=..." }
5. Client → PUT directly to object storage (presigned URL) ← 2 GB goes here
6. Client → POST /api/videos/confirm { "object_key": "..." }
7. Server → updates status=ready
```

The app server touches two small messages and never the 2 GB payload. Its memory, bandwidth, and request timeouts stop scaling with file size.

For multipart, the same idea repeats per part — the server hands out one presigned URL for each part, and the client uploads them directly.

---

## Serving: CDN for Public Media, Signed URLs for Private

Downloads split by access type:

### Public Media (profile photos, product images, public videos)

Read far more than written, often from around the world. Serving every read from the origin store means repeated long-distance fetches for the same bytes.

A **CDN** caches these objects at edge locations near users:
- First request pulls from the origin.
- Later requests for the same object are served from a nearby edge.
- Origin load stays low as reads climb.

### Private Content (tax documents, paid downloads, personal files)

Cannot be openly cacheable. The flow:

```
1. Client → GET /api/files/tax-2025
2. Server → checks authorization
3. Server → generates presigned download URL (expires in 5 min)
4. Server → 302 redirect to presigned GET URL
5. Client → fetches from object storage (or CDN with signed token)
```

A leaked link stops working after expiry. Access control lives in the server's authorization logic, not in whoever holds the link.

---

## The Transferable Pattern

Any system moving large blobs follows four moves:

| Move | Why |
|------|-----|
| Bytes in object storage, pointer in database | Database stays fast; blobs scale cheaply |
| Presigned URL for upload | App server never touches the payload |
| Multipart upload | Resumable, parallelizable, retry-safe |
| CDN for public / signed URL for private | Low latency reads without sacrificing access control |

**Video platforms, file sync, backups, and image hosting all reduce to these four moves.**

The bytes and the metadata travel separate paths, letting each scale on its own terms: cheap durable storage for the blobs, a fast small database for the queries.

> **Key idea.** The bytes belong in object storage and the pointer in the database, and a presigned URL keeps the file off your servers so the client uploads straight to storage.

---

## Sources and Further Reading

- **Uploading and copying objects using multipart upload** — AWS S3 docs — how a large object is split into parts, uploaded independently, and reassembled.
- **Sharing objects with presigned URLs** — AWS S3 docs — how a signed, time-limited URL grants one operation on one object.
- **How caching works** — Cloudflare — how a CDN caches objects at edge locations near users to cut origin load.
