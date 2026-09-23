# Design 12: Distributed File Storage (like Google Drive)

> **Lesson 3.12** · Senior · 90 min

---

## Problem Statement

Design a cloud file storage service where:
- Users upload and download files of any type and size
- Files sync across devices automatically
- Multiple users can share files/folders
- Version history: restore previous versions
- Collaborative editing for documents

---

## Step 1: Clarify Requirements

**Functional:**
1. Upload files (any size up to 50GB)
2. Download/preview files
3. Sync: changes on one device appear on all devices
4. Share files/folders with other users (view/edit permissions)
5. Version history (last 30 versions)
6. Desktop sync client (watches local folder for changes)

**Non-functional:**
- 1B users, 500M DAU
- Average user stores 15GB → 15 EB total storage
- Files uploaded: 10M/day, average 10MB = 100TB/day new storage
- Sync latency < 5 seconds (change on device A appears on device B within 5s)
- 99.9% durability (files never lost)
- Strong consistency within a device; eventual consistency across devices

---

## Step 2: Capacity Estimates

```
Storage:
  1B users × 15 GB = 15 EB total
  100 TB new uploads/day

Metadata:
  1B users × average 1,000 files = 1T file records
  Each record ~200 bytes = 200 TB metadata

Sync operations:
  500M DAU × 5 changes/day = 2.5B sync operations/day = 29,000/second
```

---

## Step 3: Chunking Large Files

A 50GB file cannot be uploaded as a single HTTP request reliably. Network interruptions are common. The entire upload would fail and need to restart.

**Chunking:** Split large files into 4MB chunks. Upload each chunk independently.

```
50GB file → 12,800 chunks of 4MB each

Chunk 1:    bytes 0 – 4MB         hash: a3f2...
Chunk 2:    bytes 4MB – 8MB       hash: b7e1...
...
Chunk 12800: bytes 49.9GB – 50GB  hash: c4d9...
```

**Benefits:**
1. **Resume interrupted uploads:** Only re-upload failed chunks
2. **Deduplication:** If chunk A3F2 is already stored (same bytes, different file), don't re-upload. This is content-addressed storage.
3. **Parallel upload:** Upload 4 chunks simultaneously → 4x speed

**Content-addressed storage (CAS):**
Each chunk is stored by its SHA-256 hash. If two users upload the same file (or any file with identical chunks), the chunks are stored once.

```
PUT /chunks/a3f2b9c1...  (body = 4MB of data)
```

The server checks: is chunk `a3f2b9c1...` already stored? If yes, skip. This is "client-side deduplication."

---

## Step 4: System Architecture

```
Desktop/Mobile Client
         │ detects file changes (inotify / fsevents)
         │
         ▼
Sync Client Library
  1. Compute file hash + chunk boundaries
  2. Query metadata service: which chunks already uploaded?
  3. Upload only missing chunks
  4. Notify metadata service: file is ready
         │
         ▼
┌────────────────────────────────────────────────┐
│              API Layer (stateless)             │
└────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
Metadata Service          Chunk Store Service
(PostgreSQL/Spanner)       │
                           ▼
                        S3 / GCS (actual bytes)
                        Content-addressed by hash
```

---

## Step 5: Metadata Schema

```sql
-- Files and folders
CREATE TABLE files (
    id              UUID PRIMARY KEY,
    owner_id        BIGINT NOT NULL,
    parent_folder_id UUID,                    -- NULL = root
    name            TEXT NOT NULL,
    type            VARCHAR(10),              -- file, folder
    size_bytes      BIGINT,
    mime_type       TEXT,
    current_version INT DEFAULT 1,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT false     -- soft delete (trash)
);

-- File versions
CREATE TABLE file_versions (
    file_id         UUID NOT NULL,
    version         INT NOT NULL,
    size_bytes      BIGINT,
    chunk_hashes    TEXT[],                   -- ordered list of chunk SHA-256 hashes
    created_at      TIMESTAMP,
    PRIMARY KEY (file_id, version)
);

-- Chunks (deduplicated)
CREATE TABLE chunks (
    hash            CHAR(64) PRIMARY KEY,     -- SHA-256
    size_bytes      INT,
    storage_path    TEXT,                     -- S3 key
    created_at      TIMESTAMP
);

-- Sharing
CREATE TABLE file_permissions (
    file_id         UUID NOT NULL,
    user_id         BIGINT NOT NULL,
    permission      VARCHAR(10),              -- viewer, editor, owner
    PRIMARY KEY (file_id, user_id)
);
```

To reconstruct a file: fetch `file_versions` to get `chunk_hashes`, then fetch each chunk from S3 by hash, concatenate in order.

---

## Step 6: Sync Protocol

The desktop client watches for file changes using OS-level APIs (Linux `inotify`, macOS `fsevents`, Windows `ReadDirectoryChangesW`).

```
File changes on Device A:
  1. OS notifies sync client: "file.txt modified"
  2. Sync client reads file, computes new chunks
  3. Compute diff: which chunks changed vs previous version?
  4. Upload only changed chunks to chunk store
  5. POST /metadata/files/{id}/versions { new_chunk_hashes }
  6. Server creates new file version, publishes event to Kafka

Sync to Device B (long polling or WebSocket):
  1. Device B maintains long-poll connection: GET /sync/changes?since={cursor}
  2. Server responds when new events arrive: "file.txt at version 5 changed"
  3. Device B fetches new chunk list, downloads changed chunks
  4. Applies changes to local filesystem
```

**Conflict resolution:**
If both Device A and Device B modify the same file while offline:
- Device A uploads → version 2
- Device B uploads → conflict detected (expected base version was 1, but current is 2)
- Device B's file renamed to "file (conflicted copy 2024-01-15).txt"
- Both versions preserved. User resolves manually. (Same approach as Dropbox.)

---

## Step 7: Version History

Naively storing 30 versions of a 1GB file = 30GB per file. Too expensive.

**Delta compression:**
Store only the differences between versions. Version 2 of a document with one paragraph changed stores only the changed chunk(s), not the entire file.

Since files are chunked, most chunks are identical between versions. Only changed chunks need new storage.

```
Version 1: chunks [A, B, C, D, E]
Version 2: chunks [A, B, C', D, E]  (C' = modified middle section)
Version 3: chunks [A, B, C', D', E'] (two more changes)

Storage: chunks A, B, C, D, E, C', D', E' — 8 chunks total
Not: 3 full copies = 15 chunks
```

---

## Step 8: Handling Large File Downloads

For a 50GB file, the client needs to resume interrupted downloads too.

**Range requests (HTTP Range header):**
```
GET /files/uuid/download
Range: bytes=1000000-2000000
```

The server returns only the requested byte range from S3. The client can download multiple ranges in parallel and resume from any point.

---

## Interview Cheat Sheet

| Question | Answer |
|---|---|
| Large file upload | 4MB chunks; content-addressed by SHA-256 |
| Deduplication | Same chunk hash = stored once; across all users |
| Resume upload | Only missing chunks need uploading |
| Storage backend | S3/GCS with CAS keys |
| Metadata | PostgreSQL: files, versions, chunks, permissions |
| Sync | OS file watcher → diff → upload changed chunks → notify peers |
| Conflict resolution | Rename conflicted version; user resolves |
| Version storage | Chunk-level dedup; only changed chunks cost storage |
| Scale | 15 EB total; S3 scales infinitely; metadata in distributed SQL |

---

> **Next:** [Design 13 — Real-Time Collaborative Docs (OT / CRDT)](./13-collab-docs.md)
