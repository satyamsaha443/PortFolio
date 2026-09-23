# Community Building: Discord Server Structure

> **Lesson 7.5** · All Audiences · 20 min

---

> **Creator Bonus** — This module is for engineers who want to teach system design themselves. It covers business and marketing topics, not technical content. Skip if you are here as a student.

---


A course without a community is a library. A course with a community is a learning environment where students help each other, stay accountable, return after completing the course, and refer new students. The community is also a retention mechanism: a student who has invested in a community relationship is far less likely to request a refund than one who never engaged beyond the video player.

Discord has become the default community platform for technical creators. It is free, familiar to the engineering demographic (most developers already have accounts), supports channels, voice rooms, roles, bots, and thread-based discussions, and does not have the algorithmic content suppression of Facebook Groups.

This lesson gives you the exact channel structure, role system, and moderation approach for a system design community of 100–5,000 members.

---

## Why Discord Over Slack or Circle

| Feature | Discord | Slack | Circle |
|---|---|---|---|
| Cost | Free | Free (limited history), $7.25+/user/month for full history | $89+/month for community plan |
| Message history | Unlimited on free | 90-day limit on free | Unlimited |
| Voice channels | Built-in, high quality | Huddles (limited) | No |
| Bot ecosystem | Massive (Carl-bot, MEE6, Midjourney-scale bots) | Large but less community-focused | Limited |
| Audience familiarity (tech) | Very high | Medium (work context) | Low |
| Threads | Yes | Yes | Yes |
| Monetisation hooks | Discord Stage, server subscriptions | None | Built-in (paid communities) |

**The case for Circle:** If you run a high-ticket program ($500+) where the community experience is part of the premium justification, Circle's polished interface and Notion-like content organisation can feel more appropriate than Discord's gamer-adjacent aesthetic. For a $79–$299 course, Discord is the right choice — your students are already on it.

---

## Server Structure

A well-designed Discord server has three zones: **public** (accessible to anyone who joins), **student** (paid students only), and **admin** (instructor and moderators).

```
🎓 SYSTEM DESIGN HUB
│
├── 📢 ANNOUNCEMENTS (public, read-only)
│   ├── #welcome
│   ├── #announcements
│   └── #changelog (course updates)
│
├── 🌐 COMMUNITY (public, all members can post)
│   ├── #introductions
│   ├── #jobs-and-opportunities
│   ├── #resources-and-links
│   └── #off-topic
│
├── 📚 LEARNING — FOUNDATIONS (🎓 Student role)
│   ├── #module-1-foundations
│   ├── #module-2-building-blocks
│   └── #module-3-system-designs
│
├── 🔥 LEARNING — ADVANCED (🎓 Student role)
│   ├── #module-4-deep-dives
│   ├── #module-5-interview-mastery
│   └── #module-6-globalisation
│
├── 💬 DISCUSSIONS (🎓 Student role)
│   ├── #design-challenges (weekly challenge thread)
│   ├── #review-my-design (student posts; peers give feedback)
│   ├── #interview-prep (interview tips, company-specific threads)
│   └── #got-the-offer (success stories — highest-engagement channel)
│
├── 👑 PREMIUM (💎 Premium role)
│   ├── #premium-lounge
│   ├── #ask-the-instructor (direct Q&A)
│   ├── #mock-interview-signups
│   └── #premium-resources
│
├── 🎙️ VOICE & STAGE
│   ├── Study Hall (open voice, camera optional)
│   ├── Office Hours (weekly, scheduled)
│   └── Mock Interview Room (by appointment)
│
└── 🔒 ADMIN (private)
    ├── #mod-log
    ├── #bot-commands
    └── #instructor-notes
```

---

## Role System

Discord roles control channel access and serve as community recognition signals.

| Role | How to get | Channel access | Colour |
|---|---|---|---|
| @everyone | Join the server | Public channels only | Default |
| 🎓 Student | Auto-assigned via Teachable integration or Zapier | All Learning + Discussion channels | Blue |
| 💎 Premium | Auto-assigned for Premium course buyers | All channels including Premium | Gold |
| 🏆 Top Contributor | Assigned manually by mods (most helpful members) | All Student channels + mod-help | Purple |
| 🎉 Got The Offer | Self-request after passing an interview | None (cosmetic recognition) | Green |
| 🛡️ Moderator | Invited by instructor | All + Admin | Red |

### Automating role assignment

When a student completes a Teachable purchase, you want their Discord role assigned automatically without manual work. Two approaches:

**Approach A — Zapier (no-code):**
```
Trigger: New sale in Teachable
Action: Add Discord role to user (matched by email)
Cost: Zapier Starter ($20/month)
Limitation: User must have connected their Discord to Teachable
```

**Approach B — Teachable Discord integration (native):**
Teachable has a native Discord integration under Settings > Integrations. Set it to automatically grant a role upon course enrolment. The student authorises the connection during or after checkout.

**Approach C — Discord bot (developer path):**
Build a simple webhook listener: Teachable fires a webhook on sale → your server (e.g. Vercel serverless function) calls the Discord API to assign the role. This is the most reliable approach if you have engineering resources and eliminates the dependency on Zapier.

---

## Engagement Mechanics

A Discord server without active engagement is a ghost town that reflects poorly on the course. The first 90 days are critical — this is when the culture and activity norms get set.

### Weekly rituals

| Day | Event | Format | Time investment |
|---|---|---|---|
| Monday | Design Challenge posted | Instructor posts a design prompt in #design-challenges | 10 min |
| Wednesday | Office Hours | 30-min voice session in Office Hours room | 30 min |
| Friday | Top submissions highlighted | Instructor picks 2–3 best #review-my-design posts and comments | 15 min |
| Sunday | Weekly digest | Automated bot posts a summary of the week's best discussions | 0 min (bot) |

### The design challenge format

Weekly design challenges are the highest-engagement feature of a system design community. Post a prompt like:

```
📐 Design Challenge #47 — Monday 9am ET

Design a distributed job scheduler that can:
- Run 1 million jobs per day
- Support recurring jobs (cron syntax)
- Guarantee exactly-once execution
- Retry failed jobs with exponential backoff

Post your design in a thread here. 
Include: architecture diagram (can be text), DB schema, 
one key trade-off you made, and one thing you'd do differently with more time.

Best submission (voted by students) gets a @Top Contributor shoutout.

Friday I'll post a reference design.
```

The voting creates engagement without requiring the instructor to evaluate every submission. The reference design on Friday gives students something to compare against and creates a reason to check back at the end of the week.

### Bots to install

| Bot | Purpose | Cost |
|---|---|---|
| Carl-bot | Auto-moderation, reaction roles, logging | Free |
| MEE6 | Levelling/XP system, rewards active members | Free / $4.99/month for premium |
| Combot | Spam detection, anti-raid | Free |
| YAGPDB | Custom commands, forms, scheduled messages | Free |

The MEE6 levelling system deserves special mention: it automatically tracks how much students post and assigns levels (Level 5 = "Active Member", Level 10 = "Community Veteran"). Members who reach certain levels can be granted additional permissions or recognition. This gamification significantly increases posting frequency without requiring any instructor effort.

---

## Moderation

A technical community does not require heavy moderation — the content naturally filters for people who are serious about engineering. But certain rules and their enforcement are non-negotiable.

### Server rules (post in #welcome, enforce strictly)

```
1. Be specific. "This doesn't work" is not a question. 
   Include what you tried, what you expected, what happened.

2. No spam, self-promotion, or recruiting without moderator approval.

3. No spoilers for specific company interview questions 
   (legal exposure for the community).

4. Use threads for long conversations.

5. The #got-the-offer channel is for celebration only. 
   No unsolicited advice in that channel.

6. English in public channels; other languages welcome in DMs 
   or dedicated locale channels.
```

### Handling common issues

**The "unanswered question" problem:** Nothing kills a community faster than questions that receive no answer. Establish a 24-hour response window: if a student's question in a Learning channel has not been answered by another student within 24 hours, the instructor or a moderator answers it. MEE6 can be configured to tag a moderator if a message has had no replies after a configurable interval.

**The self-promotion spam:** Add Carl-bot's anti-spam filter and configure it to auto-delete messages containing affiliate links or promotional URLs from non-staff members. Create a #resources-and-links channel where community members can post external content, with a slow-mode rate limit of one post per hour.

**The toxic individual:** Remove immediately and permanently. A single toxic member who is not removed quickly creates a chilling effect on the rest of the community. The instructor's willingness to moderate decisively is a signal of how seriously the community takes its values.

---

## Monetising the Community

The community is primarily a retention and referral asset, not a direct revenue source. But there are a few monetisation paths that do not feel exploitative:

**Discord Server Subscription (native):**
Discord's built-in Monetisation lets you charge members a monthly fee ($2.99–$9.99) for access to a premium tier of channels. This is appropriate once you have 500+ active members and the premium channels offer genuine value (e.g. weekly live office hours, exclusive design challenges).

**Community as a lead to cohorts:**
Your most active Discord members are your best cohort prospects. They are already engaged, already trust you, and want to go deeper. The cohort announcement should always go to Discord first, with a 48-hour early-access window before the email list. This makes Discord membership feel valuable and incentivises students to join and stay active.

**Referral programme:**
Give active Discord members (Level 10+ on MEE6) a unique referral link to the course. When a new student signs up through their link, the referrer receives: Discord credits (if you run server subscriptions), a shoutout in #announcements, or a direct cash commission (handled through Teachable's affiliate programme). Peer referrals convert at 2–5x the rate of marketing channel traffic.

---

## Community Health Metrics

Track these monthly to know if the community is healthy:

| Metric | Healthy target | Warning sign |
|---|---|---|
| Weekly active members (WAM) | > 15% of members | < 5% |
| Messages per active member/week | 3–10 | < 1 |
| Unanswered questions (24h) | 0 | > 5% |
| New member messages in #introductions | > 50% of new members | < 20% |
| #got-the-offer posts per month | 3–10 | 0 |
| Refund rate of students in Discord | < 1% | > 3% |

The refund rate correlation is particularly important: students who engage with the Discord community have dramatically lower refund rates (typically < 1% vs 4–8% for students who never engage). Community engagement is your best refund prevention strategy.

---

**Key takeaway:** Set up the Discord server before your first launch. Use Teachable's native integration to auto-assign the Student role. Run weekly design challenges. Answer every unanswered question within 24 hours for the first 6 months. The community is where students go from customers to advocates.

---

*Next: Lesson 7.6 — Launch Strategy: Beta Cohort → Testimonials → Full Launch*
