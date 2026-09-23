# Deployment & Global Scaling Guide

This course ships as a single self-contained file: `dist/index.html` (≈1.8 MB, all content embedded). That is both its main strength and the thing to plan around when scaling globally.

**What "deploying" means here:** putting that one file on a server (or CDN) where anyone in the world can open it at a URL, instead of just on your local machine.

---

## Where You Are Now

```
dist/index.html   ← 1.82 MB, everything inside
                     HTML + CSS + JS + all 121 lesson texts, embedded
```

No database. No API. No Node.js required at runtime. Any service that can serve a static file can host this.

---

## Option 1 — Netlify (Recommended, Free Tier)

Netlify is the fastest path from file to live URL with a global CDN and automatic HTTPS. Free tier handles millions of page views per month.

### Steps

**1. Install the Netlify CLI**
```bash
npm install -g netlify-cli
```

**2. Build the course**
```bash
npm run build:ui
```

**3. Deploy**
```bash
netlify deploy --dir dist --prod
```

Netlify will ask you to log in on first run, then print a live URL like `https://your-site.netlify.app`.

**4. Set a custom domain (optional)**

In the Netlify dashboard → Domain settings → Add custom domain. Point your domain's DNS to Netlify's nameservers. HTTPS is provisioned automatically via Let's Encrypt.

### What You Get on Free Tier
- 100 GB bandwidth/month (millions of page loads)
- Global CDN (nodes in 100+ cities)
- Automatic HTTPS
- Deploy previews per git branch
- Form handling if you add a contact form later

### Automate on Every Build

Create `netlify.toml` in the project root:

```toml
[build]
  command = "npm run build:ui"
  publish = "dist"
```

Then connect your GitHub repo in the Netlify dashboard. Every `git push` to `main` rebuilds and deploys automatically.

---

## Option 2 — Cloudflare Pages (Best Global Performance)

Cloudflare has the largest CDN network in the world (300+ cities). Free tier is effectively unlimited for a static site. This is the best option if you want the lowest latency for users in Asia, Africa, and South America.

### Steps

**1. Push your project to GitHub** (if not already)
```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/system-design-course.git
git push -u origin main
```

**2. Go to [pages.cloudflare.com](https://pages.cloudflare.com)**
- Connect GitHub → select your repo
- Build command: `npm run build:ui`
- Output directory: `dist`
- Click Save and Deploy

**3. Custom domain**

In Cloudflare Pages → Custom domains → add your domain. If your domain is already on Cloudflare DNS, it propagates in under a minute.

### Performance Edge: Brotli Compression

Cloudflare automatically compresses with Brotli. Your 1.82 MB file compresses to roughly **350–400 KB** over the wire — fast even on mobile.

---

## Option 3 — GitHub Pages (Free, Zero Extra Accounts)

Best if you already use GitHub and do not need a custom domain immediately.

### Steps

**1. Add the deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build:ui
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**2. Enable Pages in repo settings**

GitHub repo → Settings → Pages → Source: Deploy from a branch → `gh-pages` → `/root`.

Your site goes live at `https://YOUR_USERNAME.github.io/system-design-course/`.

### Limitation

GitHub Pages is served from a single US region with no edge CDN. Fine for a personal project; not ideal for a paying global audience.

---

## Option 4 — AWS S3 + CloudFront (Enterprise Grade)

Use this if you need full control, SLAs, or plan to monetise with access controls.

### Steps

**1. Create an S3 bucket**
```bash
aws s3 mb s3://your-course-bucket --region us-east-1
aws s3 website s3://your-course-bucket \
  --index-document index.html \
  --error-document index.html
```

**2. Upload the build**
```bash
npm run build:ui
aws s3 cp dist/index.html s3://your-course-bucket/ \
  --content-type "text/html" \
  --cache-control "public, max-age=3600"
```

**3. Create a CloudFront distribution**
```bash
aws cloudfront create-distribution \
  --origin-domain-name your-course-bucket.s3-website-us-east-1.amazonaws.com \
  --default-root-object index.html
```

**4. Invalidate cache on each deploy**
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### Cost Estimate

| Monthly users | S3 storage | CloudFront | Total |
|---------------|-----------|------------|-------|
| 10,000 | < $0.01 | ~$0.10 | **~$0.11** |
| 100,000 | < $0.01 | ~$1.00 | **~$1.01** |
| 1,000,000 | < $0.01 | ~$8.50 | **~$8.51** |

A static file at this scale is essentially free on AWS.

---

## Making Deploys Fast and Repeatable

Add a single `deploy` script to `package.json` so the full build-and-push is one command:

```json
"scripts": {
  "build:ui": "tsx scripts/build-ui.ts",
  "deploy": "npm run build:ui && netlify deploy --dir dist --prod"
}
```

Then deploying is:
```bash
npm run deploy
```

---

## Performance Optimisations Before You Go Live

### 1. Split content out of the HTML (biggest win)

Right now all 121 lessons are embedded in the HTML as one giant JSON blob. At 1.82 MB the page still loads in under 2 seconds on a fast connection, but on mobile 3G it can take 6–8 seconds.

The fix: move lesson HTML into separate JSON files and load each lesson on demand.

```
dist/
  index.html          ← <50 KB shell (layout, sidebar, JS)
  lessons/
    1-1.json          ← loaded only when the user opens that lesson
    1-2.json
    ...
```

This requires a small change to `scripts/build-ui.ts` to write per-lesson files instead of embedding them. The tradeoff is the site now requires a server (or service worker) to serve the `/lessons/` folder — it is no longer a single-file drag-and-drop. For Netlify/Cloudflare/GitHub Pages this is fine; for local file:// access it breaks.

**When to do it:** once the course grows past ~3 MB, or if mobile load time becomes a complaint.

### 2. Add a service worker (offline support)

A service worker caches the full site on first visit. After that, every lesson loads instantly even with no internet — important for commuters.

```js
// public/sw.js
self.addEventListener('install', e => {
  e.waitUntil(caches.open('v1').then(c => c.add('/')));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

Register it in the HTML:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
```

### 3. Set correct cache headers

For Netlify, create `dist/_headers` (or add to `netlify.toml`):

```
/index.html
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/lessons/*
  Cache-Control: public, max-age=604800, immutable
```

The HTML stays fresh (1 hour TTL). Individual lesson files are immutable once written — aggressive caching is safe.

---

## Custom Domain Setup (Any Platform)

### Buy a domain

Recommended registrars: Cloudflare Registrar (at-cost pricing), Namecheap, or Google Domains.

Good domain patterns:
- `systemdesign.yourbrand.com`
- `sdsmastery.com`
- `designatscale.io`

### DNS records

For Netlify or Cloudflare Pages with apex domain (`yourdomain.com`):

```
Type    Name    Value
A       @       75.2.60.5          ← Netlify's load balancer IP
CNAME   www     your-site.netlify.app
```

For a subdomain (`learn.yourdomain.com`):
```
Type    Name    Value
CNAME   learn   your-site.netlify.app
```

DNS propagation: 5 minutes on Cloudflare, up to 48 hours on other registrars.

---

## Analytics (Know Who Is Reading What)

### Option A: Plausible (Privacy-first, $9/month)

No cookies, GDPR-compliant, shows page views and country breakdown. Add one script tag before `</head>` in `build-ui.ts`:

```html
<script defer data-domain="yourdomain.com"
  src="https://plausible.io/js/script.js"></script>
```

### Option B: Fathom ($14/month)

Same privacy approach, simpler UI. Swap the script src.

### Option C: Google Analytics 4 (Free)

More data but requires cookie consent banner for EU visitors (GDPR). Paste the GA4 gtag snippet into the `<head>` in `build-ui.ts`.

### Option D: Cloudflare Web Analytics (Free)

If you use Cloudflare Pages, you get basic analytics (page views, countries, devices) for free with zero code changes in the dashboard.

---

## Global Reach: Language and Accessibility

### Right-to-left languages (Arabic, Hebrew)

Add `dir="rtl"` to `<html>` for RTL builds. The CSS grid in the sidebar already uses logical properties (`margin-inline-start`) so it will reflow correctly.

### Screen reader accessibility

The current sidebar uses `role` attributes implicitly through semantic HTML. Add explicit ARIA labels to the sidebar nav in `build-ui.ts`:

```html
<nav id="sidebar-nav" aria-label="Course modules">
```

### Print stylesheet

Students often want to print a lesson for offline study:

```css
@media print {
  #sidebar, #top-bar { display: none; }
  #content-area { max-width: 100%; padding: 0; }
}
```

---

## Scaling Checklist

```
Before launch
  [ ] Run npm run build:ui — confirm 121/121 lessons
  [ ] Open dist/index.html locally — click through 5+ lessons
  [ ] Check mobile layout (Chrome DevTools → device toolbar)
  [ ] Compress dist/index.html and confirm < 400 KB gzipped

Deployment
  [ ] Choose platform: Netlify (easiest) / Cloudflare Pages (fastest)
  [ ] Connect GitHub repo for auto-deploy on push
  [ ] Set up custom domain + HTTPS
  [ ] Verify live URL loads correctly

Performance
  [ ] Run Lighthouse on the live URL — target score > 90
  [ ] Test on mobile 3G (Lighthouse → throttle network)
  [ ] Add service worker if targeting offline use

Analytics
  [ ] Add Plausible or Cloudflare Web Analytics
  [ ] Confirm page views are tracking

Growth
  [ ] Decide on lesson-splitting if file grows past 3 MB
  [ ] Add offline service worker for mobile learners
  [ ] Consider PWA manifest for "Add to Home Screen" on mobile
```

---

## Quick-Start Summary

| Goal | Platform | Time |
|------|----------|------|
| Live link in 5 minutes | Netlify CLI | `npm run build:ui && netlify deploy --dir dist --prod` |
| Best global performance | Cloudflare Pages | Connect GitHub repo, set build command |
| Fully automated (push → deploy) | Netlify + GitHub | Add `netlify.toml`, connect repo |
| Enterprise / monetised | AWS S3 + CloudFront | See Option 4 above |

The single-file architecture means there is nothing to configure on the server side — no environment variables, no database connections, no runtime dependencies. The only thing that ships is the HTML file.
