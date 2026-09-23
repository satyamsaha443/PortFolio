# Currency, Timezone & Locale Handling

> **Lesson 6.3** · Pro · 30 min

---

## Introduction

There is a particular class of bugs that only surfaces in production, usually at the worst possible moment — when a user in Germany can't check out because the price is formatted wrong, when a scheduled report runs an hour early after Daylight Saving Time shifts, when a bank transfer arrives in the wrong currency because someone stored `0.1 + 0.2` as a float. These are not exotic edge cases. They are the entirely predictable consequences of building software as though every user lives in your timezone, speaks your language, and transacts in your currency.

This lesson tears apart three overlapping problem domains — money, time, and locale — and gives you concrete, production-grade patterns for each. We will start with the **Falsehoods Programmers Believe** lists, because the fastest way to appreciate the depth of the problem is to confront assumptions you did not even know you were making.

---

## 1. Why This Is Harder Than It Looks

### The Falsehoods

Patrick McKenzie's "Falsehoods Programmers Believe About Names" spawned an entire genre. A representative sample from each domain relevant to this lesson:

**Currencies:**
- "A currency has exactly two decimal places." — Japanese Yen (JPY) has zero. Kuwaiti Dinar (KWD) has three.
- "The currency symbol always comes before the amount." — In Sweden, `100 kr`, not `kr100`.
- "Exchange rates are stable enough to cache for a day." — On a volatile day, rates can move several percent per hour.
- "A price can always be represented as a rational number." — Commodity prices are quoted in fractions of a cent.
- "Every country has one currency." — Zimbabwe legally accepts multiple foreign currencies after hyperinflation destroyed the ZWD.

**Timezones:**
- "A timezone offset is always a whole number of hours." — India is UTC+5:30. Nepal is UTC+5:45.
- "Timezones change only once a year for DST." — Countries change their timezone rules with minimal notice. Samoa skipped an entire day in December 2011.
- "UTC doesn't have DST." — Correct, but many developers confuse UTC with GMT, and the UK *does* observe BST (UTC+1 in summer).
- "If I store a timestamp in local time I can recover UTC later." — Not without also storing which timezone the local time was in, and the exact timezone rules that were in effect at that moment.
- "Two-letter country codes map unambiguously to a timezone." — The US alone has six IANA timezone entries covering different DST rules.

**Names and Locales:**
- "A person's name fits in 255 characters." — Probably, but "fits in two fields: first and last" fails for mononyms (Cher, Pelé), patronymics, and Korean order (family name first).
- "Sorting alphabetically is universal." — Swedish `ä` sorts *after* `z`. German phone-book order puts `ü` as `ue`.
- "There is always a comma as the thousands separator." — Germany: `1.234,56`. Switzerland: `1 234.56`.

### Real Bugs That Cost Real Money

**The Knight Capital incident (August 2012)** was not a locale bug, but it illustrates how financial software failure can burn $440 million in 45 minutes. Locale and currency bugs tend to be slower and more diffuse, but the examples are plentiful:

- A European e-commerce platform stored prices in floating-point euros. After years of accumulation, rounding errors in aggregate revenue reports were several thousand euros off, discovered only during an audit.
- A subscription billing system stored renewal dates as a local datetime string. After a DST change, the renewal job fired an hour early for some customers, triggering failed card charges and customer support escalations.
- A travel booking site displayed prices in the user's detected locale without confirming the currency. A Japanese user paying in "dollars" was shown `¥` because of a locale-currency conflation bug — they were actually charged in USD.

The theme is consistent: **implicit assumptions, encoded in data models early in the project, that surface as expensive surprises late in the project**.

---

## 2. Currency Handling

### Always Store in Minor Units — Never Floats

This is the single most important rule in financial software. **Never store monetary amounts as floating-point numbers.**

IEEE 754 floating point cannot represent most decimal fractions exactly. `0.1` in binary is a repeating fraction, like `1/3` in decimal. Small errors compound:

```python
>>> 0.1 + 0.2
0.30000000000000004

>>> 1.05 * 100
105.00000000000001
```

The correct approach is to **store amounts as integers in the currency's minor unit**:

| Currency | Minor unit | Example |
|---|---|---|
| USD | cent (1/100) | $12.99 → store `1299` |
| EUR | cent (1/100) | €9.50 → store `950` |
| JPY | yen (no subdivision) | ¥500 → store `500` |
| KWD | fils (1/1000) | KWD 1.500 → store `1500` |
| BHD | fils (1/1000) | BHD 2.250 → store `2250` |

Store as `BIGINT` in the database. Use Python's `decimal.Decimal` or Java's `BigDecimal` for arithmetic. Never round mid-calculation — carry full precision until the final display step.

```python
from decimal import Decimal, ROUND_HALF_UP

def to_minor_units(amount: Decimal, exponent: int) -> int:
    """Convert a decimal amount to integer minor units."""
    factor = Decimal(10) ** exponent
    return int((amount * factor).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

# USD: exponent = 2
to_minor_units(Decimal('12.99'), 2)  # → 1299

# JPY: exponent = 0
to_minor_units(Decimal('500'), 0)    # → 500
```

### ISO 4217 Currency Codes

Always identify currencies by their **ISO 4217 three-letter alphabetic code**, not by symbol. The `$` symbol is used by at least 20 countries. EUR, USD, JPY, GBP, CNY, INR — these are unambiguous.

ISO 4217 also defines the **minor unit exponent**: the number of decimal places. Store this in your system so you know how to format and convert:

```sql
CREATE TABLE currencies (
    code        CHAR(3)     PRIMARY KEY,  -- 'USD', 'EUR', 'JPY'
    name        VARCHAR(64) NOT NULL,
    minor_exp   SMALLINT    NOT NULL,     -- 2 for USD, 0 for JPY, 3 for KWD
    symbol      VARCHAR(8),               -- for display only
    symbol_pos  CHAR(6)     NOT NULL DEFAULT 'before'  -- 'before' or 'after'
);
```

### Multi-Currency Storage: One Column vs Separate Table

Two common patterns exist for storing multi-currency amounts:

**Pattern A: Two columns on the same row**

```sql
-- On the orders table
amount_minor  BIGINT      NOT NULL,
currency_code CHAR(3)     NOT NULL REFERENCES currencies(code)
```

Simple for single-amount rows. Becomes awkward if you need to store both an original amount and a settled amount in potentially different currencies.

**Pattern B: Separate ledger / money table**

```sql
CREATE TABLE money_amounts (
    id            BIGSERIAL    PRIMARY KEY,
    entity_type   VARCHAR(32)  NOT NULL,  -- 'order', 'refund', 'fee'
    entity_id     BIGINT       NOT NULL,
    amount_type   VARCHAR(32)  NOT NULL,  -- 'charged', 'settled', 'refunded'
    amount_minor  BIGINT       NOT NULL,
    currency_code CHAR(3)      NOT NULL REFERENCES currencies(code),
    recorded_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

Pattern B is more normalised and better for audit trails. Pattern A is fine for simpler systems. Either way: **the currency code must always travel with the amount**. A naked integer `1299` is meaningless without knowing the currency.

### Exchange Rates: Source, Freshness, and Conversion Discipline

**Where to get rates:**
- **European Central Bank (ECB):** Free daily rates for ~30 currencies against EUR. Good for EUR-denominated businesses.
- **Open Exchange Rates / Fixer.io:** Commercial, hourly or real-time updates, 170+ currencies.
- **Wise (TransferWise) API:** Mid-market rates, well regarded.
- **Central bank APIs** for specific corridors (RBI for INR, PBOC for CNY via authorised sources).

**How often to refresh:** For display purposes, hourly is usually fine. For billing or settlement, use the rate at the time of the transaction and **freeze it**. Never retroactively recalculate historical amounts with today's rates.

```sql
CREATE TABLE exchange_rates (
    id              BIGSERIAL   PRIMARY KEY,
    from_currency   CHAR(3)     NOT NULL,
    to_currency     CHAR(3)     NOT NULL,
    rate            NUMERIC(20, 10) NOT NULL,  -- NOT a float
    source          VARCHAR(32) NOT NULL,
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_to        TIMESTAMPTZ,
    UNIQUE (from_currency, to_currency, valid_from)
);
```

**Display time vs storage time conversion:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Conversion Discipline                        │
│                                                                 │
│  WRONG approach:                                                │
│  Store converted amount  ──►  Rate changes  ──►  Data is wrong │
│                                                                 │
│  RIGHT approach:                                                │
│  Store original amount + original currency                      │
│  Store exchange rate snapshot at transaction time               │
│  Convert to display currency at read time                       │
│  Never mutate historical monetary records                       │
└─────────────────────────────────────────────────────────────────┘
```

### Displaying Currency: Locale-Aware Formatting

The same amount must be formatted differently depending on the user's locale:

| Locale | Amount (USD 1234.56) | Amount (EUR 1234.56) |
|---|---|---|
| en-US | $1,234.56 | €1,234.56 |
| de-DE | 1.234,56 $ | 1.234,56 € |
| fr-FR | 1 234,56 $ | 1 234,56 € |
| ja-JP | $1,234.56 | €1,234.56 |
| hi-IN | $1,234.56 | ₹1,23,456.00 (for INR) |

In JavaScript, the **Intl.NumberFormat** API handles this correctly:

```javascript
const formatCurrency = (minorUnits, currencyCode, locale) => {
  const exp = getCurrencyExponent(currencyCode); // lookup from your DB
  const amount = minorUnits / Math.pow(10, exp);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(amount);
};

formatCurrency(123456, 'USD', 'en-US');  // "$1,234.56"
formatCurrency(123456, 'USD', 'de-DE');  // "1.234,56 $"
formatCurrency(500,    'JPY', 'ja-JP');  // "¥500"
```

In Python, use the `babel` library:

```python
from babel.numbers import format_currency
from decimal import Decimal

def display_amount(minor_units: int, currency_code: str, locale: str) -> str:
    exp = get_currency_exponent(currency_code)
    amount = Decimal(minor_units) / Decimal(10 ** exp)
    return format_currency(amount, currency_code, locale=locale)

display_amount(123456, 'USD', 'en_US')  # '$1,234.56'
display_amount(123456, 'USD', 'de_DE')  # '1.234,56\xa0$'
```

---

## 3. Timezone Handling

### The Golden Rule: Store UTC, Display Local

Every timestamp stored in your database must be in **UTC**. No exceptions. Your database server's local time does not matter. The application server's timezone does not matter. UTC is the canonical reference, and you convert to the user's local time only at the moment of display.

```
                    ┌──────────────────────────────────────────┐
                    │             Timeline of a Timestamp       │
                    │                                          │
  User action       │   App Server       │   Database          │
  (Paris, CEST)     │                    │                     │
  ─────────────     │   ─────────────    │   ─────────────     │
  14:30 CEST  ──►   │   Convert to UTC   │   Store UTC         │
  (UTC+2)           │   12:30 UTC    ──► │   12:30 UTC         │
                    │                    │                     │
  User reads back   │   Read UTC         │   Return UTC        │
  (same user)       │   12:30 UTC    ◄── │   12:30 UTC         │
  14:30 CEST  ◄──   │   Convert to CEST  │                     │
                    │   (user's tz)      │                     │
                    └──────────────────────────────────────────┘
```

### The Problem with "User's Local Time"

**Daylight Saving Time (DST) transitions** create ambiguous and skipped local times. On the night clocks spring forward in the US Eastern timezone, 2:30 AM does not exist. On the night they fall back, 1:30 AM occurs twice. If you store "1:30 AM on November 3, 2024 (Eastern)" without the UTC equivalent, you cannot tell which occurrence you mean.

The 2011 Samoa DST example is the most dramatic: Samoa shifted from UTC-11 to UTC+13, skipping Friday 30 December 2011 entirely. Any system that stored local Samoan dates as strings lost a day from its timeline.

**Timezone rules change.** Political decisions, court rulings, and administrative changes alter timezone rules with minimal notice. Egypt cancelled DST permanently in 2011. Russia moved to permanent summer time in 2011, then reversed it in 2014. Your application must use a regularly updated **IANA timezone database** (also called the tz database or zoneinfo) — not a static offset.

### Recurring Events Need IANA Timezone Names, Not Offsets

This is a subtle but critical distinction. Consider a weekly meeting "every Monday at 10:00 AM London time":

```
WRONG: Store as "every Monday at 10:00 UTC+0"
  → In summer, London is UTC+1 (BST), so the meeting fires at 11:00 BST. Wrong.

RIGHT: Store as "every Monday at 10:00 Europe/London"
  → The system consults the IANA database, resolves Europe/London to the
     correct offset for that specific Monday, and fires at the right time.
```

IANA timezone names look like: `America/New_York`, `Europe/London`, `Asia/Kolkata`, `Pacific/Auckland`. Always use these names — never raw offsets — for user-facing timezone selection and for recurring event storage.

### Database Column Types

| Column type | What it stores | When to use |
|---|---|---|
| `TIMESTAMP` (PostgreSQL) | Local time, no timezone info | Avoid for new code |
| `TIMESTAMPTZ` (PostgreSQL) | UTC, displays in session TZ | Use this for almost everything |
| `DATETIME` (MySQL) | Local time, no timezone info | Avoid for new code |
| `TIMESTAMP` (MySQL) | Stored as UTC, returned in session TZ | Acceptable, but watch session TZ settings |
| epoch milliseconds `BIGINT` | ms since Unix epoch, always UTC | Cross-platform safe; requires manual formatting |

**Recommendation:** Use `TIMESTAMPTZ` in PostgreSQL or store epoch milliseconds as `BIGINT`. Never rely on your database server's timezone setting to do UTC conversion for you — make the conversion explicit in application code.

```sql
-- PostgreSQL: explicit UTC storage
CREATE TABLE events (
    id           BIGSERIAL    PRIMARY KEY,
    title        TEXT         NOT NULL,
    starts_at    TIMESTAMPTZ  NOT NULL,  -- always UTC
    iana_tz      TEXT         NOT NULL   -- 'America/New_York' for display
);

-- Insert: application sends UTC
INSERT INTO events (title, starts_at, iana_tz)
VALUES ('Weekly standup', '2025-01-06 15:00:00+00', 'America/New_York');

-- Read: database returns UTC; application converts to user's tz
SELECT starts_at AT TIME ZONE iana_tz AS local_time FROM events;
```

### Libraries

**Java:** Use `java.time` (introduced in Java 8, part of JSR-310). Never use `java.util.Date` or `Calendar` for new code — they are famously broken. Key classes:

- `Instant` — a point in time (essentially epoch seconds + nanos). Use this for storage.
- `ZonedDateTime` — an Instant with an IANA timezone. Use this for display.
- `ZoneId.of("America/New_York")` — always use IANA names.

```java
ZonedDateTime nyTime = ZonedDateTime.now(ZoneId.of("America/New_York"));
Instant utc = nyTime.toInstant();  // for DB storage
ZonedDateTime londonTime = utc.atZone(ZoneId.of("Europe/London"));  // for display
```

**Python:** The standard library `datetime` module is usable but error-prone (naive vs aware datetime objects). **Pendulum** is the preferred library — it defaults to UTC-aware, wraps the IANA database, and has excellent DST handling:

```python
import pendulum

# Always timezone-aware
now_utc = pendulum.now('UTC')
now_ny  = now_utc.in_timezone('America/New_York')

# Arithmetic across DST boundaries is correct
next_week = now_utc.add(weeks=1)

# Parse with timezone
dt = pendulum.parse('2025-03-09T02:30:00', tz='America/New_York')
# pendulum correctly handles the DST gap here
```

**JavaScript/TypeScript:** The built-in `Date` object is notoriously limited. The **Temporal API** (TC39 Stage 3 as of 2025, available via polyfill) is the modern replacement:

```javascript
import { Temporal } from '@js-temporal/polyfill';

const now   = Temporal.Now.instant();                    // UTC Instant
const nyNow = now.toZonedDateTimeISO('America/New_York'); // ZonedDateTime
const formatted = nyNow.toLocaleString('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'full',
  timeStyle: 'short',
});
```

Until Temporal is widely available natively, **Luxon** (the successor to Moment.js) is a solid production choice.

---

## 4. Locale & Internationalisation (i18n)

### Locale String Format

A **locale** is a combination of language, optional script, and optional region, written as a BCP 47 language tag:

```
en          → English (no region preference)
en-US       → English as used in the United States
en-GB       → English as used in the United Kingdom
zh-Hans-CN  → Chinese, Simplified script, as used in mainland China
zh-Hant-TW  → Chinese, Traditional script, as used in Taiwan
sr-Cyrl-RS  → Serbian, Cyrillic script, Serbia
ar-SA       → Arabic, Saudi Arabia
pt-BR       → Portuguese, Brazil
```

The locale drives number formatting, date formatting, collation (sort order), and which plural rules apply. Store the user's locale preference in their profile and propagate it through every layer of the stack.

### Number Formatting, Date Formatting, Collation

**Numbers and dates** vary significantly across locales:

```
Number 1234567.89:
  en-US    →  1,234,567.89
  de-DE    →  1.234.567,89
  fr-FR    →  1 234 567,89
  hi-IN    →  12,34,567.89   (Indian numbering system)
  ar-SA    →  ١٬٢٣٤٬٥٦٧٫٨٩  (Eastern Arabic numerals)

Date 2025-07-15:
  en-US    →  July 15, 2025
  en-GB    →  15 July 2025
  de-DE    →  15. Juli 2025
  ja-JP    →  2025年7月15日
  zh-CN    →  2025年7月15日
```

Use platform ICU or `Intl` APIs — do not hand-roll these. Hand-rolled date formatting is where "January 1st, 2025" becomes "1/1/25" in one locale and "01/01/25" in another, with no way to tell month from day.

**Collation (sort order)** is non-trivial. In standard Unicode order, uppercase letters sort before lowercase. In Swedish, `ä` comes after `z`. In Spanish (traditional), `ch` is treated as a single letter. For database sorting of localised strings, use ICU collation:

```sql
-- PostgreSQL with ICU collation
CREATE TABLE products (
    name TEXT COLLATE "sv-x-icu"  -- Swedish collation
);

SELECT name FROM products ORDER BY name COLLATE "sv-x-icu";
```

### Right-to-Left (RTL) Layout

Arabic and Hebrew are written right-to-left. Your UI layout must mirror: navigation that was on the left moves to the right, text alignment flips, icons that indicate direction (arrows, chevrons) must be mirrored.

**CSS logical properties** make this manageable without duplicating styles:

```css
/* Physical properties (old way — breaks in RTL) */
.card {
  margin-left: 16px;
  padding-right: 24px;
  border-left: 2px solid blue;
  text-align: left;
}

/* Logical properties (correct way — adapts to writing direction) */
.card {
  margin-inline-start: 16px;   /* left in LTR, right in RTL */
  padding-inline-end: 24px;    /* right in LTR, left in RTL */
  border-inline-start: 2px solid blue;
  text-align: start;           /* left in LTR, right in RTL */
}
```

Set the `dir` attribute at the HTML root based on the locale:

```html
<html lang="ar" dir="rtl">
```

React frameworks and design systems like Material UI have built-in RTL support via a direction theme context.

### Plural Forms

English has two plural forms: singular (`1 item`) and plural (`0 items`, `2 items`). This feels universal until you look further:

| Language | Forms | Example |
|---|---|---|
| Chinese, Japanese | 1 | 1件, 2件, 100件 (same form) |
| English | 2 | `1 item`, `2 items` |
| French | 2 | zero treated as singular: `0 résultat` |
| Russian | 3 | 1 файл, 2 файла, 5 файлов |
| Polish | 4 | 1 plik, 2 pliki, 5 plików, 1.5 pliku |
| Arabic | 6 | zero, one, two, few, many, other |

**Never build plural strings with a ternary:**

```javascript
// WRONG — breaks for every language except English
const msg = `${count} item${count === 1 ? '' : 's'}`;

// RIGHT — use ICU MessageFormat
import { MessageFormat } from '@messageformat/core';
const mf = new MessageFormat('en');
const msg = mf.compile('{count, plural, one {# item} other {# items}}');
msg({ count: 1 });   // "1 item"
msg({ count: 5 });   // "5 items"
```

In Python, `babel` handles plural forms:

```python
from babel.core import Locale
locale = Locale.parse('ru_RU')
# Use babel's plural rule engine to select the correct plural category
```

### String Externalisation

All user-visible strings must live outside the code in **message files**, keyed by a message ID. The two dominant systems:

**gettext (.po/.mo files):** The traditional Unix/GNU approach, widely used in Python (Django, Flask-Babel) and PHP:

```
# messages.po (English)
msgid "checkout.items_in_cart"
msgstr "{count, plural, one {# item in your cart} other {# items in your cart}}"

# messages.po (German)
msgid "checkout.items_in_cart"
msgstr "{count, plural, one {# Artikel in Ihrem Warenkorb} other {# Artikel in Ihrem Warenkorb}}"
```

**ICU MessageFormat:** More powerful, handles plural, select (gender), and nested conditions. Used by `react-intl`, Angular's `@angular/localize`, and the JavaScript `Intl.MessageFormat` proposal:

```javascript
// en.json
{
  "greeting": "Hello, {name}!",
  "cart":     "{count, plural, =0 {Your cart is empty} one {# item} other {# items}}",
  "role":     "{role, select, admin {Admin panel} user {Dashboard} other {Home}}"
}
```

Key rules for string externalisation:
- **Never concatenate translated strings.** `"You have " + count + " messages"` breaks because word order varies by language.
- **Use named placeholders**, not positional (`{name}` not `%s`), so translators can reorder.
- **Provide context comments** for translators — "This is a button label, max 10 chars."

---

## 5. Character Encoding

### Always UTF-8

There is one correct encoding for modern software: **UTF-8**. It is backward-compatible with ASCII, supports every Unicode character including emoji, and is self-synchronising (you can always find character boundaries). Do not use Latin-1, Windows-1252, or any other encoding for new systems. When you receive data in another encoding (legacy files, some EDI systems), transcode to UTF-8 at the boundary before storing.

### Emoji Are Multi-Byte

A Python `str` is a sequence of Unicode code points, not bytes. But some code points are represented as two UTF-16 code units (surrogate pairs), and string length functions in some languages/contexts return byte counts rather than character counts:

```python
emoji = "👍"
len(emoji)          # 1  (correct — one code point)
len(emoji.encode()) # 4  (UTF-8 bytes: F0 9F 91 8D)

# Be careful with slicing if you're also thinking about display width
# "👍" displays as double-width in many terminals
```

In JavaScript:

```javascript
"👍".length        // 2 — JavaScript uses UTF-16, this emoji is a surrogate pair
[..."👍"].length   // 1 — spread operator iterates code points correctly
```

### MySQL's utf8 Is Not Real UTF-8

This is a notorious historical trap. MySQL's `utf8` charset only supports up to 3-byte UTF-8 sequences, which excludes emoji and some rare CJK characters (which require 4 bytes). The correct charset in MySQL/MariaDB is **`utf8mb4`** (4-byte UTF-8):

```sql
-- WRONG: emoji will silently fail or corrupt
CREATE TABLE posts (body TEXT CHARACTER SET utf8);

-- RIGHT
CREATE TABLE posts (body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci);

-- And set the connection charset:
SET NAMES utf8mb4;

-- Or in your DSN:
-- mysql://user:pass@host/db?charset=utf8mb4
```

If you are migrating an existing MySQL database from `utf8` to `utf8mb4`, run `ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4` on each table, and update all connection strings and ORM configuration. This affects index sizes (consult MySQL documentation on `innodb_large_prefix`).

---

## 6. A Practical Internationalisation Checklist

Use this table when auditing a system for i18n readiness. Each item should have a definitive answer before launch in a new market.

| # | Category | Check | Pass Criteria |
|---|---|---|---|
| 1 | Currency | Monetary amounts stored as integers in minor units | No `FLOAT` or `DOUBLE` columns for money |
| 2 | Currency | Currency code travels with every monetary amount | No naked numeric columns without a currency code sibling |
| 3 | Currency | Exchange rates stored with source and validity window | Historical transactions reference a frozen rate |
| 4 | Currency | Display formatting uses locale-aware library | `Intl.NumberFormat` or `babel.format_currency`, not hand-rolled |
| 5 | Timezone | All timestamps stored as UTC | `TIMESTAMPTZ` or epoch BIGINT; no session-dependent `DATETIME` |
| 6 | Timezone | Recurring events store IANA timezone name | `America/New_York`, not `UTC-5` |
| 7 | Timezone | DST transition tested | Unit test covers spring-forward and fall-back |
| 8 | Locale | User locale/language preference stored in profile | BCP 47 tag, e.g. `de-DE` |
| 9 | Locale | All UI strings externalised | Zero hardcoded user-visible strings in templates/components |
| 10 | Locale | Plural forms handled via ICU or gettext | No `count === 1 ? 'item' : 'items'` in i18n-scoped code |
| 11 | Locale | RTL layout tested for Arabic and Hebrew | No physical CSS properties (`margin-left`); logical properties used |
| 12 | Locale | Sort order uses locale-aware collation | No `ORDER BY name` without explicit collation for multilingual data |
| 13 | Encoding | Database charset is `utf8mb4` (MySQL) or `UTF8` (PostgreSQL) | Emoji round-trip correctly |
| 14 | Encoding | All HTTP responses declare `Content-Type: text/html; charset=utf-8` | No implicit charset negotiation |
| 15 | Encoding | Legacy data imports transcode at boundary | No mixed-encoding strings in the database |

---

## Summary

The core disciplines collapse into a small set of invariants:

- **Money:** integer minor units + ISO 4217 code, always together, never floats, frozen rate at transaction time.
- **Time:** UTC at rest, IANA timezone name for context, library-managed conversion at display.
- **Locale:** BCP 47 tag drives all formatting; ICU handles plurals and selection; logical CSS handles RTL.
- **Encoding:** UTF-8 everywhere; `utf8mb4` in MySQL; code-point-aware string operations.

None of these are conceptually difficult. They are disciplines — habits that must be established in the data model and architecture before the first user record is written. Retrofitting them after launch is orders of magnitude more expensive.

---

*Next: Lesson 6.4 — Edge Computing Use Cases*
