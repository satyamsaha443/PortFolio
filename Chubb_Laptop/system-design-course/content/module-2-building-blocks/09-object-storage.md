# Blob / Object Storage (S3, GCS) — When to Use

> **Lesson 2.9** · Beginner + Pro + Senior · 25 min

---

## The Problem: Files Are Not Rows

Your users upload profile pictures. Where do you store them?

**Option A: Database (BLOB column)**
```sql
ALTER TABLE users ADD COLUMN avatar BYTEA;
UPDATE users SET avatar = [binary data] WHERE id = 123;
```
- Database size explodes
- Backups become massive
- Serving a 2MB image from a DB query is wildly inefficient
- No CDN integration

**Option B: File system on your server**
```
/var/uploads/avatars/user_123.jpg
```
- Works on one server
- What happens when you scale to 10 servers? Files are only on one.
- Server disk fills up
- No built-in redundancy

**Option C: Object storage (S3, GCS)**
```
s3://my-bucket/avatars/user_123.jpg
```
- Infinitely scalable
- 99.999999999% (11 nines) durability
- Accessible from any server
- Direct CDN integration
- Per-request pricing, no capacity planning

Object storage is the correct answer for files at any scale beyond a prototype.

---

## What Is Object Storage?

Object storage treats data as **objects**, not files or blocks:

- Each object has a **key** (path-like identifier), **data** (the bytes), and **metadata** (key-value pairs)
- Objects are stored in **buckets** (flat namespaces — no real directories, just key prefixes)
- Objects are immutable — you cannot partially update them; you replace the whole object
- Access is via HTTP (REST API) — `GET /bucket/key`, `PUT /bucket/key`, `DELETE /bucket/key`

```
Bucket: my-app-media
  Key: avatars/user_123.jpg      → 45KB JPEG + metadata {content-type: image/jpeg}
  Key: videos/post_456.mp4       → 245MB MP4
  Key: documents/report_2024.pdf → 12MB PDF
  Key: backups/db_2024-03-15.sql → 8GB SQL dump
```

---

## Amazon S3 (Simple Storage Service)

S3 is the original and most widely used object storage service. Launched in 2006, it now stores trillions of objects.

### Core Concepts

**Bucket:** A container for objects. Globally unique name. Region-specific.

**Key:** The object's identifier within a bucket. Looks like a path (`avatars/user_123.jpg`) but is actually just a string — S3 has no real directory structure.

**Object:** The data + metadata. Max size: 5TB per object. Use multipart upload for files > 100MB.

**Storage Classes:** S3 has multiple tiers based on access frequency:

| Class | Use case | Cost | Retrieval |
|---|---|---|---|
| S3 Standard | Frequently accessed | ~$0.023/GB/month | Instant |
| S3 Standard-IA | Infrequent access (monthly) | ~$0.0125/GB/month | Instant |
| S3 Glacier | Archive, accessed rarely | ~$0.004/GB/month | 1–5 minutes |
| S3 Glacier Deep Archive | Long-term archive, accessed yearly | ~$0.00099/GB/month | 12 hours |

**Intelligent Tiering:** S3 automatically moves objects between tiers based on access patterns. Good for data with unpredictable access.

### Durability and Availability

S3 Standard achieves **11 nines of durability** (99.999999999%):
- Objects are stored redundantly across **three availability zones**
- If one AZ burns down, your data survives
- The probability of losing an S3 object is 0.000000001% per year

For reference, 11 nines means losing one object out of 100 billion per year.

---

## Common Patterns

### Direct Upload (Client → Server → S3)

```
1. Client sends file to API server
2. API server validates (size, type, auth)
3. API server uploads to S3
4. API server returns the S3 URL to client
```

**Problem:** Large files double-transit through your servers (client → server → S3). Wastes bandwidth and server resources.

### Presigned URLs (Client → S3 Direct)

```
1. Client requests an upload URL from API server
2. API server generates a presigned URL (temporary, signed S3 URL)
3. Client uploads DIRECTLY to S3 using the presigned URL
4. Client notifies API server "upload complete"
5. API server stores S3 key in database
```

```python
# Generate a presigned URL (valid for 15 minutes)
presigned_url = s3_client.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': f'uploads/{user_id}/{filename}',
            'ContentType': 'image/jpeg'},
    ExpiresIn=900  # 15 minutes
)
# Return presigned_url to client
# Client POSTs directly to presigned_url
```

Presigned URLs are the standard pattern for large file uploads. The API server only handles small metadata operations, never the raw bytes.

### CDN in Front of S3

S3 is not a CDN. It serves from one region. Put CloudFront (or any CDN) in front:

```
Client → CloudFront edge (nearest) → S3 bucket (one region)
                                      ↑ only on cache miss
```

The CDN caches S3 objects globally. Users in Tokyo get files from Tokyo CDN edge, not from your US-East S3 bucket.

---

## Lifecycle Policies

Automatically manage objects based on age:

```json
{
  "Rules": [{
    "Status": "Enabled",
    "Transitions": [
      { "Days": 30,  "StorageClass": "STANDARD_IA" },
      { "Days": 90,  "StorageClass": "GLACIER" },
      { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
    ],
    "Expiration": { "Days": 2555 }  // Delete after 7 years
  }]
}
```

Objects start in Standard, move to cheaper tiers as they age, and eventually delete automatically. Zero manual intervention.

---

## Versioning

Enable versioning to keep all versions of an object:

```
PUT s3://bucket/report.pdf         → version 1
PUT s3://bucket/report.pdf         → version 2
PUT s3://bucket/report.pdf         → version 3

GET s3://bucket/report.pdf         → returns version 3
GET s3://bucket/report.pdf?versionId=abc123 → returns version 1
DELETE s3://bucket/report.pdf      → creates delete marker; all versions still exist
```

Versioning protects against accidental deletion and overwrites. Essential for compliance scenarios.

---

## Google Cloud Storage (GCS) and Azure Blob Storage

| Feature | S3 | GCS | Azure Blob |
|---|---|---|---|
| API | S3 REST | JSON/XML REST | REST |
| Durability | 11 nines | 11 nines | 16 nines |
| Multi-cloud | S3-compatible ecosystem | Good BigQuery integration | Azure ecosystem |
| Free egress to | CloudFront | Cloud CDN | Azure CDN |
| Best for | AWS-native apps | GCP/BigQuery workloads | Azure-native apps |

GCS and Azure Blob are functionally similar to S3. Choose based on your cloud provider.

---

## Object Storage vs File Storage vs Block Storage

| Type | Examples | Access | Use case |
|---|---|---|---|
| **Object storage** | S3, GCS, Azure Blob | HTTP REST | Media files, backups, static assets, data lakes |
| **File storage (NAS)** | AWS EFS, Google Filestore | NFS/SMB (filesystem) | Shared files across servers, legacy apps |
| **Block storage** | AWS EBS, GCP Persistent Disk | Block device (like a disk) | OS volumes, databases, anything needing low latency |

**Rule of thumb:**
- Need to store files your users upload (images, videos, documents)? → Object storage
- Need a shared filesystem mounted on multiple servers? → File storage
- Need a disk for a database or VM? → Block storage

---

## Summary

| Consideration | Answer |
|---|---|
| Store user-uploaded files | Always use object storage |
| Large file uploads | Presigned URLs for direct client→S3 upload |
| Global fast delivery | CDN in front of object storage |
| Cost optimization | Lifecycle policies to move to cheaper tiers |
| Durability | Object storage (11 nines) far exceeds any server disk |
| When NOT to use | Real-time access, frequent small updates (use block storage) |

---

> **Next:** [Lesson 2.10 — Search Systems (Elasticsearch & Inverted Index)](./10-search-systems.md)
