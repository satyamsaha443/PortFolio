# Design Google Calendar

> **Lesson 8.8** · Pro · 75 min

---
## Problem statement

Design a calendar service where people create events, repeat them on a schedule, invite others, and see when a group is free. An event has a title, a start, an end, and a timezone. It can repeat — daily, weekly, on weekdays, on the third Thursday of the month. Attendees are invited and respond yes, no, or maybe. Users open a day, week, or month view and expect everything on it, and they can ask "when are these eight people all free next week?" Reminders fire a chosen interval before an event.

The scope here is the calendar model itself: events, recurrence, timezone-correct occurrences, invitations and RSVPs, free-or-busy, and when a reminder is due. The delivery of a reminder (push, email) is a standard notification system, and firing a job at a time is the job-scheduler problem — both named and deferred. Real-time collaborative editing of an event's body, machine-learning "find a time" suggestions, video-conference integration, and full-text search are out of scope.

## Clarifying questions

Each question below fixes an assumption the rest of the design leans on.

Single user or shared? Multi-user from the start: events have attendees who RSVP, and calendars are shared.

How central is recurrence? Central. The model is built around a repeating rule that expands per view; a recurring event's individual occurrences are computed on read, not stored in the primary event model.

Do timezones matter? Yes, and they are the correctness core. Users travel, invite across zones, and daylight-saving rules shift the wall clock. A recurring event must pin to a local time and a named zone so a daylight-saving change cannot silently move it.

Reminders and notifications? Deciding when a reminder is due is in scope. Delivering it and firing the timed job are deferred to a notification service and the Job Scheduler problem.

What is out of scope? Collaborative editing of the event body (the Google Docs problem), smart scheduling suggestions, and search.

What sizes the system? The read path. Calendar views and free-or-busy queries vastly outnumber event creates.

## What makes this problem distinctive

A naive answer is an events table: one row per event, a start and an end timestamp, times in UTC, read by a range query. That model breaks the moment an event repeats, and the way it breaks shapes the rest of the design.

A recurring event cannot be stored as one row per occurrence. "Every weekday forever" has no last row to write; even a finite weekly series over several years is thousands of rows for one logical event. A practical model stores the rule — the generator — and computes occurrences within a requested window on read. That single choice cascades. Editing one occurrence becomes an exception layered over the rule. Keeping a 9 a.m. meeting at 9 a.m. across a daylight-saving change becomes a timezone computation done per occurrence. Finding a slot for a group becomes an overlap query over each person's

Rule versus occurrence. A recurring event is a rule — a compact generator like "weekly on weekdays at 9 a.m." An occurrence is one concrete firing of that rule on a specific date. Occurrences are derived data: not stored as rows in the event model, but computed for a query window when a view asks for them. The whole design follows from treating occurrences as computed, not stored.

The tension the design resolves: storing every occurrence is unbounded and impossible, but storing only the rule means every single read must expand it. The overview shows the forces, not the final architecture.

Key idea. A calendar is a rules engine: store the generator, materialize occurrences only within the window a read asks for.

## Key concepts

This section covers the concepts needed to solve this problem — prerequisites for the design work that follows. They are reviewed here directly rather than derived from a failure, because the requirements, estimation, and design all lean on this vocabulary.

### Recurrence rules and windowed expansion

A repeating event stores a recurrence rule — the iCalendar RRULE: a frequency (daily, weekly, monthly), an interval, an end condition (a date via UNTIL or a count via COUNT), and day selectors (BYDAY=MO,TU,WE,TH,FR). One row represents an unbounded series. A range read loads the rules that could overlap the requested window [from, to] and generates only the occurrences inside it. Because a view is always a bounded range, an infinite series still produces finite work. Two small facts patch the rule: an exclusion (EXDATE) drops one occurrence, and an override (RECURRENCE-ID) moves or edits one. 

### Local time versus a UTC instant

For a recurring event you store a local wall-clock time plus a named timezone (like America/New_York), not a fixed UTC instant. Daylight saving changes the offset between local time and UTC, so a stored UTC instant would drift by an hour once the series crosses a transition — a 9 a.m. standup would become 8 a.m. or 10 a.m. Storing local-time-plus-zone lets each occurrence's UTC instant be computed from the zone's rules in effect on that date. The comparison shows why the UTC-instant model breaks.

### Free-or-busy as an overlap query

Free-or-busy answers "when is this group all free?" For each person, expand their events in the window into busy intervals and merge the overlapping ones; then intersect everyone's free gaps — the complement of busy — to find openings of the requested length. It exposes only availability, never titles or attendees, so it can answer across people who cannot see each other's events. The widget sweeps four calendars to find the first common slot.

### Invitation fan-out and RSVP

Inviting attendees fans the event out: the organizer's calendar owns the canonical event, and a copy — a projection carrying the occurrence and a pending response slot — is placed on each attendee's calendar, so the event shows up on their own calendar. Each attendee's yes/no/maybe updates only their own copy, and an organizer edit re-sends the updated projection to every attendee. Across systems the same shape applies, reconciled by the iCalendar scheduling standard. (How that copy keeps each read local to one storage node is a data-model question, taken up in section 4.) The structure:

Key idea. Four concepts carry the rest of the article: the recurrence rule and its windowed expansion, local time plus a zone id, free-busy as an overlap query, and per-attendee invitation fan-out.

## 1. Requirements

Before reading on. List the functional and non-functional requirements, and name the one thing to size first — the path each read must expand on the fly.

### 1.1 Functional requirements

Functional requirements come from the actions in the problem statement — its verbs:

Create and edit events with a title, start, end, and timezone.

Recurring series: define a repeating event by a rule, and edit or cancel a single occurrence, this-and-following, or the whole series.

View a range: return everything on a calendar between two instants, with recurrences expanded into concrete occurrences.

Invite and RSVP: an event appears on each attendee's calendar, and each responds yes, no, or maybe.

Free-or-busy: given a set of people and a window, return when they are all free.

Reminders: notify attendees a chosen interval before an event.

Notification delivery internals, collaborative body editing, smart suggestions, and search are named and deferred.

### 1.2 Non-functional requirements

Non-functional requirements come from the qualities the problem demands. Each is paired with the mechanism that meets it.

Time correctness — an occurrence fires at the right wall-clock time in the right zone, even across daylight-saving transitions. Storing local time plus a zone id and computing UTC per occurrence addresses this.

Read latency — opening a view is the common action and should return in the low tens of milliseconds, including expansion. Bounded-window expansion plus a rendered-view cache — a store of already-expanded occurrences keyed by calendar and query window — addresses this.

Consistency of shared state — an RSVP or edit converges on every attendee's view. A shared event body with per-attendee response records addresses this.

Reminder timeliness — a reminder fires close to its due time. Computing the next fire time and handing it to the job scheduler addresses this.

Availability and durability — events are durable once created, and viewing survives a component failure, because the calendar DB is replicated across nodes and reads fail over to a replica or the rendered-view cache when one node is lost.

### 1.3 The binding constraint versus the non-negotiable property

Two things to state separately. Time correctness is the non-negotiable property: a meeting that slips an hour is a broken product, so it is prioritized over performance optimizations. The read/expand asymmetry is the binding constraint the architecture is organized around: views and free-or-busy queries dominate the load, and each must expand recurrence rules into concrete occurrences on the fly, so expansion cost and caching shape the design.

Key idea. Time correctness is non-negotiable; the read/expand asymmetry is what the architecture is built around.

## 2. Back-of-the-envelope estimation

The point of this estimate is to show that reads dominate, that the per-read cost is expansion rather than I/O, and that storage is not the constraint. The figures are illustrative anchors derived from usage.

~100 million daily active users, each opening the calendar ~10 times a day — so about 1 billion views/day.

~3 event writes per user per day — about 300 million writes/day.

~1,000 events per heavy user, mostly recurring series at ~1 KB each.

### 2.1 Reads dominate

A billion views a day over 86,400 seconds is about 11,600 read QPS on average, with a sharp morning peak as people check their day. Writes are about 300e6 ÷ 86,400 ≈ 3,500 QPS. Reads outrun writes several-fold, and every read expands rules — so the read path is where the design spends its effort.

### 2.2 Expansion is the per-read cost

A week view might expand a few dozen recurring series into a few hundred concrete occurrences. That is cheap for one query but multiplied across ~11,600 reads per second, so rendered views are cached and expansion is always bounded to the requested window — never "expand forever."

### 2.3 Storage is not the constraint

A repeating event is one row however many times it fires, so a heavy user with ~1,000 events is on the order of 1 MB. An infinite series costs one record. Rule compression explains why storage stays modest while reads and expansion drive the architecture.

Key idea. Reads dominate writes several-fold, expansion is the per-read cost to cache and bound, and rule compression keeps storage small.

## 3. API design

The API centers on event writes, window reads (the hot path), and availability queries. Each endpoint is derived from one need. The authenticated user is the actor; the calendar and attendees are resources, never taken from the request body as identity.

### 3.1 Create an event

A create carries the rule, not the occurrences. A recurring event posts once with an rrule; the server persists the rule only. Attendees and reminders attach to the same call.

### 3.2 Edit an event, with scope

An edit must say what it targets. The scope decides whether the server writes an override, splits the series, or edits the master rule.

### 3.3 Read a range — the hot path

The range read is where expansion happens. It returns concrete occurrences within [from, to] (the instances in the path — "instance" and "occurrence" mean the same thing here), expanding every recurring series server-side, so the client renders without understanding rules.

### 3.4 Query free-or-busy

Free-or-busy is its own privacy-scoped endpoint. It surfaces availability across several people without exposing any event detail.

### 3.5 Respond to an invitation

An RSVP updates only the authenticated attendee's response record; the responder comes from the session, not the body.

Key idea. Create stores the rule; edit carries a scope; the range read is the hot path that expands; free-or-busy is a separate privacy-scoped query.

## 4. Data model

The model begins with the event entity; each thing it cannot represent forces the next.

### 4.1 Start with one entity: the event

An event has a calendar, a title, a start and end in local time, and its timezone. One row.

This handles a one-off event, but it cannot represent one that repeats.

### 4.2 Repeating events can't be one row per occurrence: the rule

"Every weekday forever" is unbounded, and even a finite multi-year series is thousands of rows. So a repeating event stays a single row carrying a recurrence rule; occurrences compute on read.

rrule example: FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR. The single-row series is the compression that keeps storage tiny.

### 4.3 One occurrence can diverge: the exception

A user reschedules next Tuesday's standup, or cancels just that one. One date now differs from the rule. That is a separate exception record keyed to the original occurrence time — either an exclusion (cancelled) or an override (moved or edited).

Expansion applies the rule, drops the exclusions, and substitutes the overrides.

### 4.4 Events involve other people: the attendee

Each attendee needs the event on their calendar and a response slot. That is a per-attendee participation record.

response is one of pending, yes, no, or maybe. An RSVP writes only this row, so responses can be updated independently of the event body.

### 4.5 Reminders are independent timed facts: the reminder

"Alert 10 minutes before" is its own fact and its own scheduled job, evaluated per upcoming occurrence. A reminder belongs to the attendee who set it, so it carries an attendee_id — two attendees can set different reminders on the same event.

### 4.6 Where each entity lives

The event, exception, attendee, and reminder records shard by calendar_id: the database is partitioned across nodes by that key, so all rows for one calendar (rolling up to the owning user) live together on one node — its shard. A range read then touches that single node with no cross-calendar joins, which is what keeps a calendar view fast. An invited event is the one case that would otherwise cross shards: its canonical row lives on the organizer's calendar, so a versioned projection — a copy carrying the rule, exceptions, and that attendee's response — is replicated into each attendee's cal

Key idea. One Event row carries the rule; exceptions, attendees, and reminders hang off it; occurrences are computed on read rather than stored; everything shards by calendar_id.

## 5. High-level design

The design is presented incrementally: start with the simplest thing that works and let each failure introduce the next component.

Reading the diagrams. Each step outlines the components newly added at that step in pink, so you can see at a glance what changed.

### 5.1 The naive version

One app server and one events table. Store each event as a row; answer "show my week" with a range query on start time. Five failures surface at once: repeating events cannot be one row per occurrence; a range query must return occurrences that were never stored; single-occurrence edits have nowhere to live; multi-attendee events must appear on many calendars with responses; and reminders must fire correctly across zones without materializing every future instance. Each is addressed in turn.

### 5.2 Fix 1: store the rule, expand per window

A repeating event stores one row holding a recurrence rule. A range read loads the rules that could overlap [from, to], expands each into the concrete occurrences inside that window, and returns them. Occurrences never persist, and expansion stays finite even for an infinite series because it is bounded to the query window.

### 5.3 Fix 2: layer single-occurrence exceptions

Editing or cancelling one occurrence writes an exception keyed to that occurrence's original time. Expansion now applies the rule, subtracts the cancellations, and applies the overrides — so one series stays one row plus a few small facts.

### 5.4 Fix 3: fan out to attendees with per-attendee RSVP

A multi-attendee event must appear on many calendars and track each response. Referencing one shared row from every attendee would break the single-shard read, since an attendee's shard would not hold the invited event. So the organizer's calendar owns the canonical event, and inviting fans out a versioned projection — a copy of the event plus a per-attendee response slot — into each attendee's calendar. An attendee's range read stays on one shard; an organizer edit bumps the version and re-sends the projection; an RSVP writes only the attendee's own response and propagates back to the organiz

The invite fan-out over time:

### 5.5 Fix 4: reminders as scheduled jobs, computed per occurrence

Reminders must fire on time without materializing every future instance. Each reminder computes its next occurrence's fire time — applying the rule and the timezone — and hands that one time to the job scheduler, which fires it and then schedules the following one. Timezone correctness applies here: the fire time is computed against the zone's rules for that date.

### 5.6 Fix 5: cache rendered views

Expansion is the per-read cost, and the same views are opened repeatedly. A rendered-view cache keyed by calendar and window holds the expanded result; a miss pays the full expansion, while a hit avoids the expansion and the database reads. A cache of derived data is only safe if it cannot serve a stale view, so the key includes a per-calendar version that increments transactionally on every write that changes a view — an edit, an exception, a series split, or an RSVP that shows on it. A stale window's key no longer matches, so it is recomputed instead of served; a bounded time-to-live backsto

### 5.7 The composed design

Combining the fixes yields the whole system. The event, exception, attendee, and reminder records live in the calendar DB sharded by calendar_id; occurrences exist only in the rendered-view cache; reminder records feed the job scheduler; and free-or-busy reads the same DB. The app server writes the rule on create, an exception on a single-occurrence edit, and attendee records on invite; the scheduler is the sole writer of fire times; the cache holds only derived views.

A calendar-view read over time, with the cache as the common case:

Strong-answer criteria. A complete answer derives each component from a constraint — rules because series are unbounded, window-bounded expansion because views cover a range, exceptions because one occurrence can diverge, per-attendee fan-out because events span people, scheduled reminders computed per occurrence — and caches rendered views because expansion is the per-read cost.

Key idea. Each component answers one failure of the naive table: rule storage, windowed expansion, exceptions, fan-out, scheduled reminders, and a rendered-view cache.

## 6. Deep dives

Three deep dives carry the design: the recurrence model and expansion, timezones and daylight saving, and free-or-busy with invitation fan-out and reminder firing.

### 6.1 Recurrence model and expansion

Before reading on. A standup repeats every weekday forever, next Tuesday is cancelled, and from March the time changes for good. How do you store that as roughly one row plus two small facts, and how does "show my week" turn it into concrete slots?

Store the rule, never the occurrences. One row — frequency, interval, end condition, day selectors — represents an unbounded series, so writes and storage stay tiny and a pattern edit is a single update. A range read loads the series whose rule could overlap [from, to] and generates only the occurrences inside that window; because a view is always bounded, an infinite series produces finite work, and the result is cached as a rendered view.

The exceptions handle the two edits. Cancelling one occurrence records an exclusion for that date (EXDATE); moving or editing one records an override for that occurrence (RECURRENCE-ID). Expansion applies the rule, drops the exclusions, and substitutes the overrides — so "every weekday except this Tuesday, which moved to 3 p.m." is one rule plus two small facts.

The one genuinely different edit is this-and-following. "Change it from March onward" must not touch past occurrences, so it is a series split: end the original rule at the split point (set its UNTIL) and create a new series with the new pattern starting there. Two rows now represent what looks like one edited series, and history stays intact.

### 6.2 Timezones and daylight saving

Before reading on. A 9 a.m. daily standup is set in New York. Six months later New York shifts out of daylight saving. If you stored the event as a fixed UTC instant, what happens to the meeting, and how do you keep it at 9 a.m.?

Store local time plus a named timezone for recurring events, not a bare UTC instant. Daylight saving changes the offset between local time and UTC, so a fixed UTC instant drifts by an hour when the series crosses a transition. Storing the wall-clock time and the zone id lets each occurrence's UTC instant be computed from the zone's rules in effect on that date — which is why the zone id, not a stored offset, must travel with the event: the offset changes across the year.

Three cases fall out of that rule. A past one-off event can be frozen as a resolved UTC instant, since its zone rules are already settled; a future-dated one-off carries the same exposure as a series (the rules could change before it arrives), so it keeps local-time-plus-zone too. An all-day event is floating — a bare date with no time and no zone — because a birthday is the same calendar day everywhere; converting it to UTC would slide it across midnight for viewers in other zones, turning the 5th into the 4th.

Two edges need an explicit policy. On spring-forward a wall-clock time can be skipped (2:30 a.m. may not exist); on fall-back it can occur twice (1:30 a.m. happens twice). The policy shifts skipped times forward to the next valid time and selects the first occurrence of a duplicated time, applied consistently. And because governments change daylight-saving rules, those changes ship in the IANA time-zone database; treat it as versioned data to keep current, and compute future instants against a current copy rather than freezing them far in advance.

### 6.3 Free-or-busy, invitation fan-out, and reminders

Before reading on. You want a 30-minute slot when eight people are all free next week, and each has recurring meetings. What does the query compute, how does an event end up on all eight calendars with their responses, and how does a reminder fire once for each occurrence?

Free-or-busy is an overlap query over expanded occurrences. For each person, load their events in the window, expand recurrences into concrete busy intervals, and merge the overlapping ones into a busy set. To find a common slot, intersect everyone's free gaps — the complement of busy — and return openings of the requested length. The cost is the sum over attendees of their events-in-window, which is why it is bounded to a window and cached, and why it returns only busy/free, never titles — a distinct, privacy-scoped read. Conflict detection is the same query scoped to one calendar: warning a 

Invitations are per-attendee participation, not a single global row. The organizer's calendar owns the canonical event; inviting replicates a versioned projection — a copy carrying the rule, exceptions, and that attendee's response — into each attendee's calendar, so an attendee's range read stays on one shard and an organizer edit re-propagates the updated version rather than forcing a cross-shard read. An RSVP writes only the attendee's own response. Attendees also customize their own copy (a private reminder, their own override), and inviting someone on a different calendar system copies th

Reminders ride the same occurrence computation, and a per-recipient idempotency key suppresses duplicate delivery. A reminder's fire time is the next occurrence's start minus its offset, computed under the correct timezone and handed to the job scheduler; when it fires, the next one is scheduled. Each firing carries an idempotency key (event, occurrence, attendee, offset) — scoped to the recipient, so two attendees who both set a 10-minute reminder do not share a key and suppress each other. The key makes a retried fire a no-op; fanning one attendee's notification out to several of their devic

Key idea. Availability and conflict detection are the same overlap query at different scopes; invitations are per-attendee participation; reminders fire once via an idempotency key.

## 7. Variants

At 10× scale, reads and expansion partition by calendar_id, so more shards and read replicas absorb the load, and reliance on the rendered-view cache grows because each miss pays the full expansion cost. Free-or-busy across large groups is the worst-scaling operation, so bound the attendee count and window and precompute each user's busy intervals for typical windows. Reminder volume grows into more scheduled jobs, which the job-scheduler design already handles.

For shared and delegated calendars — a team calendar, or an assistant managing someone's schedule — add an access-control layer where each calendar defines permission: see free-or-busy only, see details, or edit. A view can then aggregate several calendars the user may access; the event model is unchanged, and free-or-busy respects the most restrictive permission, returning availability without detail.

For concurrent edits and the RSVP race, isolate edits per field so an RSVP (one attendee's response) and a time change (the event body) do not overwrite each other, and version the event so a stale edit is detected and retried rather than clobbering a newer change. The contended case is an RSVP arriving for an occurrence the organizer just cancelled: the cancellation wins and the orphaned response is dropped. Across systems, iTIP sequence numbers settle the race — the higher number prevails.

For external interoperability, importing and exporting iCalendar and subscribing to external feeds is mostly serialization plus periodic sync, because the internal model already mirrors iCalendar's structure of rules, exclusions, and overrides. Synchronization re-reads a remote feed and reconciles changes with the same expand-and-diff logic.

Key idea. The rule/exception model scales by calendar_id; permissions, per-field edits, and iTIP sequence numbers handle sharing and races; interop is serialization over the same model.

## 8. The transferable pattern

A calendar is a rules engine, not an event list: you persist the generator — the recurrence rule — and materialize concrete occurrences only within the window a read asks for. That one choice drives everything downstream. A single-occurrence edit becomes an exception layered on the rule. Time correctness becomes computing each occurrence under the timezone rules for its date. Group scheduling becomes an overlap query on expanded busy intervals. Reminders become fire times computed per occurrence.

The same "store the rule, expand on demand, patch with exceptions" shape recurs in cron-style job scheduling, billing cycles, and shift rosters. Treating occurrences as derived, non-persisted data reduces the problem to a stored rule, a bounded windowed expansion, and a small set of exceptions.

## Review: the 30-second answer

If you had thirty seconds to give the whole design, it rests on five decisions, each derived above:

Store the rule, not the occurrences. A repeating event is one row; a range read expands it into concrete occurrences bounded to the window and caches the result.

Patch with exceptions. A single-occurrence edit is an exclusion or override; this-and-following is a series split that preserves history.

Keep local time plus a zone id. Compute each occurrence's UTC instant from current timezone rules, so daylight-saving transitions do not shift the intended local time; all-day events float.

Fan invitations out per attendee. A canonical event with a versioned projection replicated to each attendee's calendar inside a system (single-shard reads), a reconciled copy across systems via iTIP; RSVP is a per-attendee write.

Reminders are scheduled jobs. Compute the next fire time per occurrence, hand it to the job scheduler, and fire once per recipient with an idempotency key that includes the attendee.

## Quiz

Test your understanding of the key design decisions in this calendar.

## Sources and further reading

RFC 5545 — iCalendar (IETF) — the recurrence-rule (RRULE) grammar and the exclusion and single-occurrence-override model (EXDATE, RECURRENCE-ID).

RFC 5546 — iTIP (IETF) — scheduling messages (REQUEST, REPLY, CANCEL) and sequence numbers for cross-system invitations and RSVPs.

Time Zone Database — IANA — the canonical source of timezone and daylight-saving rules, updated as governments change them.

The System Design Courses

Go beyond memorizing solutions to specific problems. Learn the core concepts, patterns and templates to solve any problem.

