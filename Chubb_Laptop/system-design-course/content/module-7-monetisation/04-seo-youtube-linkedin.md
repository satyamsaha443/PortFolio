# SEO, YouTube & LinkedIn Marketing Plan

> **Lesson 7.4** · All Audiences · 35 min

---

> **Creator Bonus** — This module is for engineers who want to teach system design themselves. It covers business and marketing topics, not technical content. Skip if you are here as a student.

---


You cannot just publish a course and wait for students to arrive. Distribution is as important as content quality — many excellent courses fail commercially because their creators treated marketing as an afterthought. This lesson gives you a concrete, channel-specific marketing plan that a solo creator can execute without a marketing team or paid advertising budget.

The three channels that reliably build an audience for technical educational content are: SEO (organic search), YouTube, and LinkedIn. Each has a different growth curve and a different role in the funnel. Together, they compound: your SEO brings search traffic to your site, your YouTube channel builds trust with that traffic, and LinkedIn keeps you in front of your audience between search queries. The email list sits at the centre — all three channels should be driving subscribers to it.

---

## The Funnel

```
Discovery (cold audience)
  │
  ├── Google Search → SEO blog post / course landing page
  ├── YouTube Search → System design video
  └── LinkedIn → Post / article / comment
          │
          ▼
    Engagement (warm audience)
          │
      Email subscribe (free lead magnet or newsletter opt-in)
          │
          ▼
    Purchase (converted audience)
          │
      Course purchase / cohort enrolment / B2B inquiry
```

Every piece of content you create should serve one of three jobs: bring in cold traffic (discovery), warm them up (build trust), or convert them. Most content does all three to some degree. The framing helps you avoid creating content that is enjoyable to produce but serves no one.

---

## Channel 1: SEO

### Why SEO for technical course creators

"System design interview" gets 40,000–60,000 Google searches per month in the US alone. "How to design YouTube" gets 5,000–10,000. "CAP theorem explained" gets 8,000–12,000. These are buyers who are actively searching for the thing you teach. Ranking for these queries is worth more per visitor than social media traffic because the intent is explicit — they are not passively scrolling, they are looking for a resource.

The competitive reality: Educative, ByteByteGo, High Scalability, and several Substack publications already rank for the highest-volume queries. You will not outrank them immediately. The strategy is to target the long tail first and build domain authority over 12–18 months.

### Keyword strategy

**Tier 1 — Long-tail targets (low competition, specific intent):**
- "how to design a rate limiter system design" (500–1,000 searches/month)
- "system design interview for backend engineers" (1,000–2,000)
- "design google drive system design interview" (1,000–2,000)
- "consistent hashing explained simply" (2,000–5,000)
- "CAP theorem real world example" (1,000–3,000)

**Tier 2 — Medium competition targets (target once your domain has authority):**
- "system design interview questions" (20,000–30,000/month)
- "how to prepare for system design interview" (10,000–15,000)
- "kafka vs rabbitmq" (5,000–8,000)

**Tier 3 — High competition targets (2+ years of consistent publishing):**
- "system design interview" (40,000–60,000/month)
- "system design course" (10,000–20,000/month)

### Content format for SEO

Ranking on Google requires content that is genuinely better than what currently ranks. For system design content, "better" means:

1. **More complete:** cover requirements, capacity estimation, architecture, DB schema, API design, and trade-offs — not just a surface-level overview
2. **More visual:** ASCII diagrams or embedded images at every conceptual step
3. **More honest about trade-offs:** "Kafka vs RabbitMQ — here is exactly when to use each and when each fails" outperforms "Kafka is great for high-throughput"
4. **Updated:** show a "Last updated" date and actually update content when the landscape changes

The lessons you have written for this course (Modules 1–6) are the content. Publish them as blog posts on your own site or Ghost newsletter, with proper SEO metadata. A 3,000-word lesson on consistent hashing with a worked example and a comparison table will rank for long-tail consistent hashing queries within 6–12 months with no link-building effort if the content is genuinely the best available.

### Technical SEO basics

| Setting | Recommendation |
|---|---|
| Platform | Ghost Pro (built-in SEO), or WordPress with RankMath |
| Site speed | Core Web Vitals: LCP < 2.5s, CLS < 0.1 |
| Title tags | `Consistent Hashing Explained (With Visual Examples) | [Your Brand]` |
| Meta descriptions | 150–160 characters, action-oriented, includes target keyword |
| Internal linking | Every post links to 2–3 related posts; always link to course landing page |
| Schema markup | FAQ schema for posts that answer common interview questions |
| Sitemap | Auto-generated by Ghost or RankMath; submit to Google Search Console |

**Link-building for technical content:**
- Submit technical posts to Hacker News Show HN and r/ExperiencedDevs (authentic, not spammy)
- Get mentioned on ByteByteGo, the morning paper, or system design newsletters through quality content
- Guest post on freeCodeCamp, dev.to, or Towards Data Science (these have high domain authority; a backlink from them is valuable)

### SEO publishing schedule

| Month | Output | Focus |
|---|---|---|
| 1–3 | 2 posts/month | Long-tail keyword targets, Module 1 + 2 content |
| 4–6 | 2–3 posts/month | System design walkthroughs (Module 3 content) |
| 7–12 | 3–4 posts/month | Expanding to Tier 2 keywords, updating old posts |
| 13–24 | 4 posts/month | Building Tier 2 authority, pursuing Tier 3 targets |

---

## Channel 2: YouTube

### The system design YouTube landscape

The most-watched system design content on YouTube at time of writing comes from a handful of creators: ByteByteGo (2.2M subscribers), Gaurav Sen (800K), Hussain Nasser (580K), and several smaller channels. This is not a saturated market — it is a market with a growing audience (more engineers interview every year) and room for differentiated voices.

Differentiation options:
- **Depth:** go deeper than ByteByteGo's 3-minute animations; a 45-minute full design walkthrough
- **Beginner accessibility:** most system design YouTube assumes prior knowledge; your Module 0–1 angle is underserved
- **Interview simulation:** realistic mock interview format with real candidate errors, not polished presentations
- **Company-specific:** "How Google Spanner works and why you should care" targets a narrow audience with high intent

### Video types and their purpose

| Video type | Length | Discovery potential | Conversion potential |
|---|---|---|---|
| Concept explanation ("How [X] works") | 10–20 min | High (search) | Medium |
| System design walkthrough ("Design [X]") | 30–50 min | Medium–High | High |
| Mock interview format | 30–45 min | Medium | Very High |
| "I got an offer at [FAANG]" case study | 15–25 min | High (clickbait in good sense) | High |
| Shorts (tip or concept < 60s) | < 60s | High (Shorts algorithm) | Low |
| Comparison ("Kafka vs. Pub/Sub") | 12–20 min | High | Medium |

**The 80/20 content calendar:** Produce 1 long-form video per month (system design walkthrough or mock interview) and 2–4 Shorts per month from clips of the long-form content. The long-form builds subscribers; the Shorts serve the algorithm and surface you to new audiences.

### Video production workflow

```
Week 1: Script and record
  Day 1-2: Outline (concept map, key points, what question does this answer?)
  Day 3-4: Record (screen capture + talking head or screen + voiceover)
  Day 5: Edit (cut dead air, add diagrams, chapter markers)

Week 2: Publish and promote
  Day 1: Upload, set title/thumbnail/description
  Day 2: Publish; share to LinkedIn, newsletter, Discord
  Day 3-7: Respond to comments (YouTube algorithm rewards engagement velocity)
```

Production quality note: audio matters more than video. A 1080p video with muffled audio will fail; a 720p video with clear audio will succeed. Invest in a USB condenser microphone ($60–$120) before you invest in a camera upgrade.

### YouTube SEO (separate from Google SEO)

YouTube is the second largest search engine in the world. Ranking on YouTube requires:

1. **Title:** exact match to search query, front-loaded. "Designing WhatsApp — Full System Design Interview Walkthrough" not "My System Design Course: WhatsApp Chapter"
2. **Description:** first 150 characters are shown before "Show more." Include the primary keyword, a brief value prop, and a call to action (link to course, link to newsletter). Full description should be 300–500 words.
3. **Tags:** 5–10 relevant tags. Use TubeBuddy or vidIQ to find tags competitors use.
4. **Thumbnail:** A/B test thumbnails (YouTube's built-in A/B test feature after 1,000 subscribers). High-contrast text on clean background consistently outperforms complex designs. "GOOGLE | SYSTEM DESIGN" in large text on a white background outperforms a stock photo of a server room.
5. **Chapters:** Add chapters via timestamps in the description. Chapters improve watch time by letting viewers skip to relevant sections — and watch time is the #1 YouTube ranking signal.
6. **End screens and cards:** Every video should end with a suggestion to subscribe, a recommendation to the next relevant video, and a mention of the course/newsletter. Cards mid-video can direct viewers to related content without waiting until the end.

---

## Channel 3: LinkedIn

### Why LinkedIn for engineering educators

LinkedIn has 1 billion members, ~200 million of them in engineering or tech roles. Its algorithm currently (2024–2025) dramatically favours organic text posts over link posts — a text-only post with good engagement can reach 50–200× the poster's follower count through the network. For comparison, Twitter/X organic reach has declined significantly; LinkedIn has become the default professional network for engineers who want to share ideas.

LinkedIn works differently from Twitter or Instagram. The content that performs best is:
- Specific, concrete, and teaches something in the post itself
- Written for an engineer who is on their lunch break, not someone passively scrolling
- Structured with a compelling first line (the hook) that must convince the reader to click "see more"
- Supported by a visual (diagram, screenshot, table) — visuals get 3–5x more impressions

### Post formats that work

**Format 1: The Conceptual Breakdown**
```
Most engineers get CAP theorem wrong.

Here's what it actually says (and what the coffee shop analogy misses):

CAP stands for Consistency, Availability, and Partition Tolerance.
The theorem says: during a network partition, you can only guarantee 
two of the three.

But here's what's often left out:

Partition tolerance isn't a choice. Networks partition. It happens.
The real trade-off is: when a partition occurs, do you return stale data
(choose Availability) or do you refuse to respond (choose Consistency)?

MongoDB chooses CP — it refuses to respond if it can't reach a quorum.
Cassandra chooses AP — it returns the best data it has.

Neither is wrong. They serve different use cases.

What system design book gave you the pizza shop explanation and left it there?
```

**Format 2: The Career Story**
```
I was asked to design Twitter's tweet feed in a Google interview.

I said "just sort by timestamp."

The interviewer gave me a 30-second pause, then said:
"And if you have 200 million users, each following 500 people — 
how do you build that timeline in under 100ms?"

I had no answer.

That question sent me down a 6-week rabbit hole of feed ranking,
fan-out on write vs. read, and the tradeoffs Twitter actually made.

Here's what I learned: [link to blog post or course]
```

**Format 3: The Framework / Cheat Sheet**
Post a useful reference (diagram, numbered list, table) with 200–400 words of explanation. These get bookmarked heavily, which is a strong LinkedIn engagement signal.

### LinkedIn publishing schedule

| Type | Frequency | Goal |
|---|---|---|
| Conceptual breakdown (text) | 2–3×/week | Follower growth, impressions |
| Career story / lesson learned | 1×/week | Trust, relationship building |
| Framework / cheat sheet | 2×/month | Saves and shares |
| Article (long-form, 800–1,500 words) | 1×/month | SEO credibility, authority |
| Course announcement (soft sell) | 1×/month max | Direct conversion |

**The ratio:** 80% educational/valuable, 20% promotional. If every other post is a "buy my course" message, you lose followers. The audience accepts promotional content proportional to the value you have delivered without asking for anything in return.

### LinkedIn growth benchmarks

| Month | Consistent posting | Expected followers |
|---|---|---|
| 3 | 3 posts/week | 500–1,500 |
| 6 | 3 posts/week | 1,500–5,000 |
| 12 | 3 posts/week | 5,000–20,000 |
| 24 | 3 posts/week + featured posts | 15,000–50,000+ |

---

## Integrated Marketing Calendar (Month 1–6)

| Week | SEO | YouTube | LinkedIn |
|---|---|---|---|
| 1 | Publish Lesson 1.1 as blog post | Record design walkthrough | 3 text posts (conceptual) |
| 2 | Submit to Google Search Console | Edit video | 3 posts (1 career story + 2 concept) |
| 3 | Publish Lesson 1.2 as blog post | Publish video + promote | 3 posts + share YouTube video |
| 4 | Internal link audit | Respond to all comments | 3 posts (1 framework/cheat sheet) |
| 5 | Publish Lesson 1.3 | Start next video | 3 posts (conceptual) |
| 6 | Update Lesson 1.1 with keyword | Publish YouTube Short | 3 posts + newsletter mention |

---

## The Compound Effect

None of these channels produce results immediately. SEO takes 6–12 months to show meaningful traffic. YouTube takes 12–24 months to build a subscriber base worth monetising through sponsorships. LinkedIn compounds faster (3–6 months to 5,000+ followers with consistent quality posting) but requires ongoing activity to maintain.

The creators who succeed execute consistently for 18–24 months before any channel feels like it is "working." The creators who fail spend 3 months trying each channel, see no results, and conclude that marketing does not work for technical content. It does — the timeline is just longer than most people expect.

Build a system you can sustain: 2 blog posts per month, 1 video per month, 3 LinkedIn posts per week. That is 8 hours of marketing work per week. It compounds. After 18 months, you will have 24 blog posts (some of which rank), 18 videos (some of which have 20,000+ views), and a LinkedIn following of 10,000–30,000 engaged engineers. That is the foundation for a $300K+/year content business.

---

**Key takeaway:** Start LinkedIn immediately (zero cost, immediate reach). Start YouTube in month 1–2 (low barrier, high trust-building). Start SEO publishing in month 1 (slow burn, highest long-term ROI). Treat all three as complementary channels that feed your email list — the list is the business; the channels are distribution.

---

*Next: Lesson 7.5 — Community Building: Discord Server Structure*
