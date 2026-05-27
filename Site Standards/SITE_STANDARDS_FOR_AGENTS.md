# Site Standards & Build Rules — Agent Prompt (Read First)

**Owner:** Dominic Jenkins
**Last updated:** 2026-05-26
**Companion file:** `SITE_STANDARDS_FOR_AGENTS.csv` (same rules in structured form for grep/filter)

---

## Read this first — you are the agent

You have been assigned to one of Dominic Jenkins' sites (Grade A Rentals of Tampa, or a new project he's spinning up). Before you touch any code, write any copy, or set up any infrastructure, **read this entire document**. These rules are non-negotiable defaults. You customize brand voice, color, copy, and feature set per project — but every rule below applies universally on every site Dominic owns.

If a rule below conflicts with a request Dominic just made, ask once. If a rule below conflicts with a dated lesson file (`docs/seo-learnings/lessons/YYYY-MM-DD_*.md`), the lesson wins. If you've never seen this site before, your first action is to scan the `docs/`, `memory/`, and `CLAUDE.md` files — do not start building.

This document is intentionally exhaustive. It is the prompt. Treat every section as binding.

---

## Section 1 — How agents should work on my sites

### 1.1 Source-of-truth hierarchy

Every site should have a layered source of truth. Agents read **top-down** before they write:

1. **`docs/seo-learnings/lessons/YYYY-MM-DD_topic.md`** — dated lessons extracted from videos, calls, and real data. Real evidence beats theory.
2. **`docs/seo-learnings/principles.md`** — distilled keepers across all lessons.
3. **`docs/seo-learnings/references/`** — `stats.md` (canonical numbers — never invent), `voice.md` (brand voice), `humour.md`, `opinions.md`, `stories.md`.
4. **`docs/seo-learnings/TODO_LIST.md`** — master prioritized list.
5. **`CLAUDE.md`** at the repo root — site-specific operating spec, plans, trigger words.
6. **Memory system** — codified rules from prior agent sessions.

If a lesson and CLAUDE.md conflict, the lesson wins. The lesson is real evidence. CLAUDE.md is opinion.

### 1.2 Memory system (every project gets one)

Agents must have a persistent, file-based memory system. Path pattern:

```
/Users/dubd/.claude/projects/{project-slug}/memory/MEMORY.md
/Users/dubd/.claude/projects/{project-slug}/memory/feedback_*.md
/Users/dubd/.claude/projects/{project-slug}/memory/project_*.md
/Users/dubd/.claude/projects/{project-slug}/memory/user_*.md
/Users/dubd/.claude/projects/{project-slug}/memory/reference_*.md
```

The agent saves to memory whenever:
- I correct an approach ("no not that")
- I confirm a non-obvious approach worked ("yes exactly")
- I share a fact about the business that's not derivable from code
- I reference an external system or process
- I express a permanent preference

What NOT to save:
- Code patterns derivable from `git log` / current code
- Ephemeral task state
- Anything already in CLAUDE.md

Save format: each memory in its own file with frontmatter:

```markdown
---
name: {short-kebab-case-slug}
description: {one-line summary for relevance matching}
metadata:
  type: {user | feedback | project | reference}
---

{body — for feedback/project: lead with the rule, then **Why:** and **How to apply:**}
```

`MEMORY.md` is the index — one line per memory under ~150 chars.

### 1.3 Trigger words / slash commands

Every site supports short phrases that load a full playbook. Examples I use:

- **`deep sweep`** — audit recent changes + SEO pass + check:deploy
- **`rank map`** — competitive gap analysis per keyword
- **`triple scan`** — launch 3 parallel agents auditing different angles
- **`ads cleanup`** — run the Google Ads 6-step playbook
- **`lighthouse fix`** — PageSpeed Insights on top 5 pages, iterate to 100%

The agent reads the matching memory or `CLAUDE.md` block when I type it. The agent never invents trigger words I haven't defined.

### 1.4 Date everything

Every note, handoff, lesson, decision gets a YYYY-MM-DD stamp. Dated headers in `AGENT_HANDOFF.md`. Dated lesson filenames. Dated fact rows in project memories. Convert relative dates ("Thursday") to absolute ones when saving.

---

## Section 2 — SEO standard (mandatory on every site)

### 2.1 The non-negotiables

1. **Google score over everything.** If a third-party tool (Seobility, Ahrefs, SEMrush) flags something that Google's own docs say is fine, Google wins.

2. **Never add keywords just for keywords' sake.** Every keyword addition must be:
   - Natural and readable
   - Contextually relevant to the page topic
   - NOT marketing-y or stuffed ("the brand behind", "town's #1" = BAD)

3. **Titles & meta descriptions — exact targets:**
   - Titles: 50–60 characters (hard stop 65)
   - Meta descriptions: 155–160 characters
   - Never repeat the brand name in every meta
   - Never repeat keyword stems in one title

4. **Duplicate content is ENEMY #1.**
   - Paginated pages (`?page=2`): noindex anything past page 1
   - Shared text blocks across pages must be customized with city/category-specific context
   - City and category pages must be ≥30% unique from each other (shingle similarity check)
   - Never create a new page that competes with an existing one — extend instead

5. **Always check the codebase before suggesting or building anything.** The codebase is large; many features already exist. Never waste my time pitching something already shipped.

### 2.2 What NOT to do

- ❌ Don't make SEO changes without reading source-of-truth files first
- ❌ Don't add keywords without checking they don't already exist
- ❌ Don't rename h2/h1 tags (only add to body paragraphs)
- ❌ Don't remove duplicate pages — noindex or differentiate instead
- ❌ Don't optimize for SEO tools (Seobility, Ahrefs) — optimize for Google
- ❌ Don't add internal links to improve link density (only natural links)
- ❌ Don't churn SEO — let changes settle 90 days before iterating

### 2.3 Before touching any page

1. Read all memory for context from prior agents
2. Check `docs/AGENT_HANDOFF.md` (what's been done, what's pending)
3. Search the codebase — the feature/fix might already exist
4. Think about downstream effects — trace what breaks before changing schema/routes/structure
5. If in doubt about SEO impact: "Will Google like this?" If no, don't do it

### 2.4 The "never silence flags by killing content" rule

If an SEO tool flags low word count, missing H1, missing alt text — fix the actual issue. Don't:
- Delete the page
- Add filler content
- Add the missing element with garbage filler

If the page genuinely doesn't need more content, mark it `noindex` instead.

---

## Section 3 — Voice & content rules

### 3.1 All written content must sound human

Every word a customer reads must be undetectable as AI. Telltale words to **DELETE ON SIGHT**:

- "ultimate" / "world-class" / "industry-leading" / "premier"
- "leverage" / "robust" / "elevate" / "embrace" / "delve into"
- "seamless" / "cutting-edge" / "nestled" / "bustling" / "vibrant"
- "comprehensive guide" / "unlock" / "in today's fast-paced world"
- "absolutely" / "incredibly" / "truly" / "really" used as filler
- "Whether you're X or Y, we've got you covered"
- "Look no further than..."
- "From X to Y, we offer it all"
- "your one-stop shop" / "proudly offer"

Voice tells of an actual human writing:
- First-person plural ("we", "our", "us")
- Short sentences mixed with longer ones for rhythm
- Comma splices and sentence fragments are OK when they sound like speech
- Specific names over generic phrases ("FishHawk Ranch" beats "the suburbs")
- Max **one em-dash per piece**
- No exclamation marks
- Real numbers from `stats.md`, never round
- Phone formatted properly with parens and dash, never bare digits
- Lead with the answer. Don't ramp up.

### 3.2 Voice file — every site must maintain `docs/seo-learnings/references/voice.md`

Re-read it before writing any customer-facing copy. If a piece of copy doesn't pass the voice check, rewrite it.

### 3.3 Stats file — never invent numbers

Every fact-claim cites `references/stats.md` (e.g., "20,000+ events since 2013" or "$2M liability"). If a number isn't in `stats.md`, don't write it.

---

## Section 4 — Infrastructure every site needs

### 4.1 Database — schema-drift safety

Every site that uses a DB has a **schema-drift validator** that runs at server boot:

1. Reads `information_schema.columns` for every table in the live schema.
2. Compares against expected schema from `shared/schema.ts` (or equivalent).
3. **Exits the process with code 1** if any table or column is missing.
4. Override via `ALLOW_SCHEMA_DRIFT=1` env var only for emergencies.

This refuses to serve traffic against an out-of-sync DB, which is the only way to prevent silent INSERT failures that customers hit before anyone notices.

### 4.2 Idempotent CREATE TABLE pattern (no migration choreography)

Every new feature table is created via:

```ts
await pool.query(`CREATE TABLE IF NOT EXISTS feature_x (...)`);
await pool.query(`CREATE INDEX IF NOT EXISTS feature_x_idx ON feature_x (...)`);
```

In the boot-critical migration block, BEFORE the schema-drift validator runs. This way feature deploys don't require a separate `npm run db:push` step.

### 4.3 URL Lock Registry

Every site has a `shared/url-lock-registry.ts` listing every URL the site must continue to serve. Boot fails if any locked URL is missing from the router.

The lock prevents accidental route deletion that would break:
- SEO equity built up at that URL
- External backlinks
- Past customer bookmarks
- Google Ads landing pages

Override only with an unlock code + dated audit comment.

### 4.4 Activity logs

Every customer-impacting action gets logged. Two tables:

- **`system_logs`** — generic event firehose (`level`, `source`, `category`, `message`, `details`, indexed for fast filter)
- **`order_activity_logs`** (or equivalent for the business entity) — per-resource audit trail (`action`, `description`, `performed_by`, `source`)

Each agent that runs code that mutates data logs via these tables. There's an admin UI to browse logs (`/dubd43admin/activity` or equivalent).

### 4.5 Visitor identification (not raw IP)

Customer/visitor identification uses a per-browser cookie (`gar_visitor_id` UUID format), NOT raw IP. Two devices behind a coffee-shop NAT don't share recall snippets. IP is stored hashed-only.

### 4.6 PII scrubbing

Any text persisted from user input — chat messages, search queries, log entries — runs through a scrubber that strips:

- Phone numbers (`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`)
- Email addresses (`\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b`)
- Street addresses (number + word + city/state)
- ZIP codes (`\b\d{5}(?:-\d{4})?\b`)

Replace with `[phone]`, `[email]`, `[address]`, `[zip]` tokens before write.

### 4.7 Branded email template

Every transactional email uses a single branded template with:

- Hosted logo URL (NOT inline data: images — Gmail strips those)
- Brand color bar
- Standard footer with phone + address + business name
- Optional sections: paragraphs, bullets, image-grid, CTA button, attachment

Helper signature pattern (TypeScript):

```ts
sendBrandedEmail({
  to: string,
  subject: string,
  heading: string,
  paragraphs: string[],
  eyebrow?: string,
  bullets?: string[],
  imagesRow?: Array<{ url: string; alt: string }>,
  cta?: { label: string; url: string },
  signoff?: string,
  attachment?: Array<{ content: string; name: string }>, // base64 + filename
})
```

### 4.8 Cron / scheduled jobs use in-process intervals

Don't introduce a separate cron infrastructure. Use `setInterval` started at boot:

```ts
const orchestratorInterval = setInterval(() => syncStateFn().catch(() => {}), CHECK_INTERVAL_MS);
```

Common ones every site needs:
- Promo orchestrator (toggles flash codes active/inactive)
- COI expiry watcher (alerts when an insurance cert is 30 days from expiry)
- Email reconciler / abandoned-cart worker

### 4.9 Object storage / asset hosting

Every site hosts assets in a CDN-backed object store (Replit Object Storage, R2, S3). Static `.pdf`, `.png`, hero images go there.

URL pattern: `/objects/uploads/{uuid}` — proxied through the server so the underlying CDN URL never leaks and we can rotate providers freely.

### 4.10 JSON-LD structured data

Every page renders schema.org JSON-LD:

- Homepage: `LocalBusiness` with `Organization` person founder
- Product pages: `Product` with `Offer`
- Category pages: `ItemList`
- Service pages: `Service`
- Blog posts: `BlogPosting` with `Person` author + `Organization` publisher
- City pages: `Service` + `Place`

Use `alternateName` to preserve entity continuity when products are renamed.

### 4.11 Sitemaps

Every site has:
- `/sitemap.xml` — current canonical URLs only (NOT noindex pages)
- `/robots.txt` — explicit Allow / Disallow + sitemap reference
- IndexNow key file at the root (random 32-char filename) for Bing / Yandex push notifications

### 4.12 Canonical tags + 301 redirects

- Every page sets a `<link rel="canonical">` to its preferred URL
- 301 redirects for legacy URLs go through a single registry (`server/redirects.ts`)
- Cloudflare or equivalent forces `www → apex` (webhooks always use apex)

### 4.13 AI chat (Misty-style)

Every site that does real customer service benefits from a persistent AI chat:

- Powered by GPT-5 or equivalent
- Persona has a name, photo, voice
- Tool-calling: `search_products`, `check_availability`, `calculate_total`, `create_booking`, `send_quote`, `get_customer_order`, `get_reviews`, `send_owner_alert`, `connect_to_team`
- Conversation persistence to a dedicated DB table (`{persona}_chat_messages`) with `visitor_key`, `role`, `content`, `tool_calls`, `turn_index`
- Admin viewer to read every conversation as a transcript
- PII scrub on stored snippets
- After-hours awareness (different greeting outside business hours)
- Logged-in customer awareness (pull prior orders before assistant responds)
- Voice rules baked into the system prompt

### 4.14 Outreach system (paste-an-email + bulk send)

Every site benefits from a B2B outreach tool. Pattern:

- DB table: `partner_outreach` with `organization_name`, `contact_name`, `contact_email`, `contact_phone`, `organization_type`, `notes`, `status`, `initial_email_sent_at`
- Admin UI at `/dubd43admin/partners` (or equivalent)
- Per-row "Send pitch" button + bulk select-all + "Send N pitches" with confirmation + 600ms throttle
- Filter chips by type (corporate / schools / parks / etc.)
- Pitch templates branch on `organization_type` — different pitches for different audiences
- Optional attachment endpoint (`/api/admin/partners/:id/send-coi`) for sending docs alongside pitches

### 4.15 Status-page transparency

Every site has a basic admin dashboard showing:

- DB connection state
- Email send status (last 24 hrs, failures)
- Cron job last-run timestamps
- Pending background workers
- API integration health (Stripe, Brevo, Twilio, GHL, etc.)

### 4.16 Smart-search matcher (shared)

Every catalog with searchable items needs ONE shared search-matcher used everywhere (admin, customer, AI chat). Features:

- Synonym map (jumper/moonwalk → bounce house)
- Hyphen + apostrophe normalization (Spider-Man matches "spider man")
- Token-AND matching ("bounce spider" matches Spider-Man Bounce)
- Number/SKU/inflatable-number matching as a separate code path

Never let customer search and AI search drift apart by using two different matchers.

---

## Section 5 — Code-quality rules

### 5.1 Don't add what wasn't asked

- Don't add error handling for impossible scenarios
- Don't add fallbacks for cases that can't happen
- Don't validate at every layer — only at system boundaries
- Don't use feature flags or backwards-compatibility shims when a direct change works
- Three similar lines is better than a premature abstraction
- No half-finished implementations

### 5.2 Comments are last resort

- Default: zero comments
- Only comment when the WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug)
- Never explain WHAT the code does — let well-named identifiers do that
- Never reference the current task ("added for ticket #123") — that's PR description material

### 5.3 Type checking is a hard gate

- Every site has a TypeScript baseline (e.g., "678 errors")
- Every PR's tsc count must equal or be less than the baseline
- Pre-commit hook blocks any commit that introduces new TS2304 (`Cannot find name`) errors

### 5.4 Test in the actual app

For any UI or frontend change: start the dev server, click through the feature, watch for regressions. Type-checking and test suites verify correctness, not feature correctness — if you can't test the UI live, say so explicitly rather than claiming success.

### 5.5 Logging > silent failure

- All errors get logged with `console.error("[module-name] description:", err.message)`
- Fire-and-forget background jobs catch their own errors so they don't crash the request
- Customer-facing errors give a friendly message + phone number to call

---

## Section 6 — Operational rules

### 6.1 Memory / handoff doc

Every project has `docs/AGENT_HANDOFF.md` updated after every significant change. Each entry has:

- YYYY-MM-DD timestamp
- What changed
- Why (1 sentence)
- Anything pending or blocked

### 6.2 Commit message conventions

```
{scope}: {short imperative}

{2-4 sentence body explaining the why}

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Scopes: `seo`, `outreach`, `partners`, `referrals`, `marketing`, `fix`, `assets`, `misty` (or the project's main feature names).

### 6.3 Push only on explicit instruction

The agent commits when work is at a clean stopping point. The agent pushes ONLY when I explicitly type "push." Never push automatically.

### 6.4 Excluded paths

Standard `.gitignore` exclusions:

- `.DS_Store`
- `node_modules/`
- `dist/`, `build/`
- `.env`, `.env.local`
- Dated working folders (`*may 25th*`, `update *`, etc.)
- Personal documents (`legal-letters/`, income statements, etc.)

The agent NEVER stages those even if they show up in `git status`.

### 6.5 Production DB access

Agents can read production data when needed (lookups, audits, reports) but NEVER:

- Mass UPDATE / DELETE without explicit owner authorization
- Touch product `active`, `discount_active`, `quantity`, `price` flags
- Commit `.env` files
- Echo secrets

If an action requires owner authorization, the agent asks once with concrete scope.

### 6.6 Never claim what isn't true

- Don't claim school-district approval if you're a parks-only vendor
- Don't claim 24/7 availability if it's business hours
- Don't promise same-day delivery — say "sometimes available, call to confirm"
- Use real numbers from `stats.md`, never round, never invent

### 6.7 Real customer voice

Owner texts customers in his own voice (Dominic for Grade A). The agent does NOT auto-text customers OR claim auto-text capability ("we'll text you back in 5 minutes" is forbidden if the system can't actually send that text). The agent surfaces high-intent contacts to the owner via an alert; the owner reaches out personally.

---

## Section 7 — Marketing system patterns

Every business site benefits from:

### 7.1 Standing promo codes (auto-toggled)

- Weekend flash code (e.g., `WEEKEND25`) — server-side orchestrator toggles `active=true` Fri 6am–Sun midnight, `false` otherwise
- Weekday code (e.g., `WEEKDAY30`) — validation checks the customer's event date matches Mon/Tue/Wed
- Per-customer coupon grants (rebook reminders, abandoned cart) — one active coupon per customer at a time, never stacked

### 7.2 Cash referral program

- Past customers only (DB check on signup endpoint)
- Pays out via Cash App / Venmo / PayPal — not coupons or credits
- Admin payout dashboard with pending / paid / declined statuses
- Auto-email referrer when their friend's order is paid

### 7.3 B2B outreach (described above in 4.14)

- Schools, churches, daycares — annual partnership pitch
- Corporate — B2B pitch with packages + Net 30 option
- Parks & Rec — vendor-approval inquiry with COI attached
- Single tool, multiple pitch templates, one bulk-send button

### 7.4 Banner system

The sitewide banner shows ONLY when there's a real promo (weekend flash active) OR a real calendar holiday (Memorial Day actual Monday, July 4, Easter via Gregorian algorithm). NEVER a daily generic "look at us" banner.

### 7.5 Social-post content asset folder

- `agent-assets/social-posts/{YYYY-MM-DD}-{campaign}/` per campaign
- PNG + PDF versions of every graphic
- Image-generation script that uses the real brand logo (NOT an AI-fabricated wordmark) via `editImageBuffers` or equivalent

---

## Section 8 — Things to avoid by default

- ❌ Generic AI chatbots that don't know the business
- ❌ Mass email blasts without per-recipient personalization (use bulk-send with throttle + name substitution)
- ❌ Mock data in tests (use real database fixtures)
- ❌ Hardcoded brand strings in components (read from `business_settings` table)
- ❌ Inline `<style>` blocks (use Tailwind or a consistent design system)
- ❌ Custom CSS frameworks (use shadcn/ui + Tailwind)
- ❌ Multiple ORMs in one project (pick one — Drizzle, Prisma, Sequelize — and stick with it)
- ❌ Unbounded queries (always `.limit()` in admin/list endpoints)
- ❌ N+1 queries (use `.with()` or explicit JOIN in admin views)
- ❌ Email sends from non-whitelisted IPs (use Brevo Authorised IPs list)

---

## Section 9 — Per-site customization checklist

For each new site, the agent must capture and codify:

1. **Business identity** — legal name, DBAs, phone (formatted), address, founding year
2. **Owner identity** — real name, role, voice
3. **Color palette** — primary hex, accent hex, contrast pairs
4. **Voice file** — sample sentences in the owner's voice
5. **Service area** — cities, counties, radius
6. **What the business does** — 2-sentence description suitable for `LocalBusiness` schema
7. **What it does NOT do** — explicit exclusions to prevent agents from over-claiming
8. **Brand-tell words** — phrases that flag a piece of copy as off-brand
9. **Source-of-truth folders** — `docs/seo-learnings/lessons/`, `references/`, etc.
10. **Memory bootstrap** — initial set of `user_*.md`, `feedback_*.md`, `reference_*.md` files

---

## Section 10 — Final rule

**When in doubt, ask once. Never assume.** Specifically:

- If I haven't authorized a destructive operation (mass UPDATE, push to main, send to >50 people), ask first.
- If a feature could go either of two reasonable ways, ask which.
- If you can't find a real email/fact to use, say so — don't fabricate.

If I push back on an approach, save the feedback as a memory immediately so the next agent doesn't repeat it.

---

*This document is the DEFAULT for any site Dominic owns. Apply it as-is, then layer site-specific rules on top. Do not argue with rules in here unless you have evidence (a lesson file or memory) that contradicts them.*

---

## Section 11 — Reference patterns (how Dominic builds things)

Not every site needs every system below. But if a new site needs one of these, **build it the same way as Grade A Rentals**. Don't reinvent. Don't propose a "modern" alternative. The patterns below have been refined through real customer flow and real money — they work. Open the referenced files in the Grade A Rentals repo and mirror the shape.

### 11.1 Booking / order flow
- **Pattern:** 3-step accordion on a single page (Contact → Event Details → Review & Book). One section open at a time via `expandedSection` state.
- **Files:** `client/src/pages/booking.tsx`, `client/src/lib/cart.tsx`
- **Rules:** localStorage-backed form (key `BOOKING_FORM_KEY`) with a 30-minute inactivity TTL that clears the session if cold. Phone/email sanitized via `cleanPhone`/`cleanEmail` before submission. Signature is captured in Step 3 via `BookingSignatureBlock` (canvas → SVG → base64). Promo codes, damage waiver, and payment method picker all live in Step 3.

### 11.2 Date selection — dropdown, never visual-only
- **Pattern:** Year/month/day dropdowns first, with a shadcn `Popover` + `Calendar` as a secondary aid — never force a full calendar view on the user.
- **Files:** `client/src/components/ui/date-picker.tsx`, `client/src/components/date-nav-input.tsx`, `client/src/pages/availability-browse.tsx`
- **Rules:** Manual prev/next-day arrow buttons (`shiftDate` helper) for fast nav. Times are `Select` dropdowns (never inline numeric input). Earliest bookable date enforced server-side via `getEarliestBookableYmd()` (next day, or day+2 if past cutoff). All dates stored as `YYYY-MM-DD` strings; parsed with `date-fns` to avoid timezone drift. Holiday check runs on every date change via `/api/public/holiday-check`.

### 11.3 Cart & inventory hold
- **Pattern:** localStorage cart + server-side `inventoryReservations` with TTL auto-release.
- **Files:** `client/src/lib/cart.tsx`, `server/routes.ts` (`POST /api/cart/hold`, `/heartbeat`, `/release`)
- **Rules:** Session ID persisted in localStorage (`GRADE_A_CART_SESSION`, 24h). On add-to-cart, POST `/api/cart/hold` creates a reservation with `status="cart"`. Heartbeat endpoint keeps the hold alive; cold sessions auto-release after ~15 min. Clearing the cart calls `/api/cart/release`. No deposit charged until full booking form + payment token POST to `/api/orders`.

### 11.4 Checkout / payment
- **Pattern:** Square Web Payments SDK as primary card processor, Stripe for BNPL (Affirm, Klarna, Zip, Afterpay). Deposit + balance split. Inline signature.
- **Files:** `client/src/pages/booking.tsx`, `server/square-payments.ts`, `server/stripe-payments.ts`
- **Rules:** Deposit % comes from `business_settings`, not hardcoded. `recomputeOrderTotals()` on the server is the source of truth — never trust client math. Order transitions to `confirmed` only after `depositPaid=true` AND signature collected. Failed checkout returns the user to booking page; no partial/retry payments fired automatically.

### 11.5 Buffer / setup time
- **Pattern:** Per-product `setupTime` integer (minutes) on the `products` table. Availability calc respects it as a turnaround window.
- **Files:** `server/routes.ts` (`productNeedsTurnaroundBuffer`), `shared/schema.ts`, `server/venue-scheduling.ts`
- **Rules:** Generators and Tables/Chairs skip buffer (same-day flip OK). All inflatables/tents/concessions need buffer. Per-product-per-date overrides via `productSetupTimes` table. `buildVenueTimeSlotsForDate()` uses buffer to block overlapping venue slots.

### 11.6 Quote-to-order conversion
- **Pattern:** Drafts have `status="draft"` + `quoteToken` UUID. Resume URL `/booking/resume/:token` restores cart + form. Conversion creates a NEW order; old draft archived.
- **Files:** `server/routes.ts` (`/api/booking/resume/:token`, `/api/quotes/resume/:token`)
- **Rules:** Line items, `orderPackages`, `bannerThemeId`, coupons all copy directly — no recomputation that risks loss. Pre-2026-05-24 had a bug where packages/banner dropped on conversion (fixed). Archive old draft with `archiveReason` + `archiveTime` only AFTER conversion succeeds.

### 11.7 Coupon system
- **Pattern:** Order of operations is `subtotal → coupon → tax`. Per-customer grants checked FIRST (referral/employee), then global promo codes table.
- **Files:** `server/routes.ts` (`POST /api/validate-promo`), `server/coupon-grants.ts`
- **Rules:** `hasPackages=true` rejects the code — promos do not stack with packages. Overnight fee ($75) NOT taxed (only subtotal + damage waiver go into `taxableAmount`). Auto-toggled flash codes (`WEEKEND25`, `WEEKDAY30`) flipped via server-side orchestrator + `business_settings` flags; hidden from UI when inactive.

### 11.8 Holiday & banner system
- **Pattern:** Real holidays computed via Gregorian math (`nthWeekdayOfMonth`, `lastWeekdayOfMonth`, Easter algorithm). Sitewide banner shows ONLY on a real promo or a real holiday — never a daily generic banner.
- **Files:** `shared/holiday-utils.ts`, `client/src/components/seasonal-experience.tsx`
- **Rules:** `getShiftedDates(eventDate, deliveryOffset, pickupOffset)` calculates delivery/pickup shifts (default -1 day delivery, +1 day pickup). Banner active window is 00:00–23:59 of the actual day; do not use `activeDaysBefore/After` to creep into surrounding days.

### 11.9 Driver app, dispatch, multi-stop routes
- **Pattern:** `driverStops` table joined to orders. Status lifecycle: `pending → in-transit → arrived → completed | skipped`. `autoAttachOrderToTruck()` fires when order status flips to `active`.
- **Files:** `server/driver-routes.ts`, `server/utils/order-date-sync.ts`, `shared/schema.ts` (driverStops)
- **Rules:** `syncTruckAssignmentsOnScheduledDateChange()` re-runs route optimization if event date moves. Skip feature can jump ahead; server auto-restores the skipped stops on completion. GPS pings stored in `gpsTrackingPings`. Per-stop load checklist (`driverLoadChecklists`) tells the driver what to grab off the truck (uses the customer-facing inflatable number, not internal `product_id`).

### 11.10 Admin quick-book vs full customer book
- **Pattern:** Quick-book strips the wizard down to a single admin form — Dominic isn't going to fill out 3 accordion steps to enter a phone order.
- **Files:** `client/src/pages/admin-quick-booking.tsx`, `client/src/pages/admin-quick-quote.tsx`
- **Rules:** Quick-book SKIPS overnight detection, holiday shift, dayBefore flag, signature, setupSurface. Quick-book CREATES orders with `status="pending"` directly. Customer self-serve signature link can be sent afterwards. Quick-quote generates a PDF via `/api/quotes/generate-pdf` and doesn't touch payment.

### 11.11 Customer account / returning customers
- **Pattern:** Email/phone lookup detects past customers. Reorder via `/resume-booking?token=X` restores the prior cart.
- **Files:** `client/src/pages/account.tsx`, `server/routes.ts` (`/api/orders`)
- **Rules:** Guest checkout always allowed (email-only lookup via `cleanEmail`). Loyalty tracked in `customers.loyaltyPoints` + `customers.loyaltyTier`. Re-engagement events logged to `reactivationLogs`. No algorithmic "suggested items" — let the customer pick.

### 11.12 Activity logs
- **Pattern:** Fire-and-forget `recordOrderActivity({ req, orderId, action, description, source })` helper. Never throws — logging failures log to console but never break the underlying mutation.
- **Files:** `server/system-logger.ts`, `shared/schema.ts` (orderActivityLogs)
- **Rules:** `actorFromReq(req)` extracts username/email from auth, falls back to "system". Common actions: `order_updated`, `pickup_removed`, `date_moved`, `discount_applied`, `payment_refunded`. Admin viewer at `/dubd43admin/activity`. Agents query this BEFORE asking "what happened to order X" — the answer is in the table.

### 11.13 Package bundles
- **Pattern:** `packages` table defines bundles. `packageItems` defines what's inside. `orderPackages` links order → package. Cart UI displays packages separately from line items; checkout expands them via `recomputeOrderTotals()`.
- **Files:** `shared/schema.ts` (packages, packageItems, orderPackages)
- **Rules:** Cart shows "Promo codes don't stack with packages" warning when both present. Recompute on submit catches stale bundle math AND prevents the category-slot-inflatable-never-reached-order bug fixed 2026-05-24. Package-line items get `productId=null` + `lineNote="from package X"`.

### 11.14 Banner themes (printed signage add-on)
- **Pattern:** Separate `bannerThemes` table; joined via `orderBannerTheme`. Cart shows a synthetic addon item with `isBannerAddon=true` flag so it's visible in totals but not sent as a product.
- **Files:** `shared/schema.ts` (bannerThemes, orderBannerTheme), `client/src/pages/booking.tsx`
- **Rules:** Banner fee was wiped by recompute on every charge pre-2026-05-24 — fixed by excluding banner from recompute. Design notes captured at checkout; `proofApprovedAt` + `printedAt` track production state.

### 11.15 Reviews import
- **Pattern:** Google Places API returns max 5 review texts; real review count stored separately. Manual import UI for the long tail.
- **Files:** `server/routes.ts` (gbp-reviews-sync), `client/src/pages/admin-settings.tsx` (Settings → Social Media)
- **Rules:** Never claim the Places-API count as the full count — use the manually maintained `reviews_count` business setting. Manual import accepts paste blocks or CSV (name, text, rating, date). `ReviewCarousel` rotates on the homepage.

### 11.16 Blog system
- **Pattern:** `blog_posts` table + Markdown body + react-markdown renderer. Hero is a real product photo by default; AI-generated images only when explicitly requested.
- **Files:** `server/blog-routes.ts`, `client/src/pages/blog.tsx`, `client/src/pages/blog-post.tsx`
- **Rules:** Two dates surfaced — `publishedAt` (never changes once set) and `updatedAt` (refreshed on every edit). JSON-LD `BlogPosting` schema with `Person` author + `Organization` publisher. AI image gen via `generateImageBuffer` (OpenAI gpt-image-1, Render-only API key — don't try locally).

### 11.17 Service-area / city pages
- **Pattern:** Hand-curated rich content for priority cities; synthetic fallback for the long tail. Slug must match canonical (e.g., `dade-city` 301s to `dade-city-fl`).
- **Files:** `server/rich-city-pages.ts`, `server/routes.ts` (`/api/seo/city-pages/:slug`), `client/src/pages/location.tsx`
- **Rules:** Rich pages get neighborhoods, HOA rules, parks, lot sizes, real local landmarks — written from photos Dominic took. Synthetic pages cover the long tail but use unique nearby-landmark + top-3-neighborhood + FAQ rotation to stay above 30% unique vs siblings. `lastUpdated` bumps only on content change (not metadata).

### 11.18 Email confirmations
- **Pattern:** Triggered on order status transitions. Templates live in DB (`quick_emails` table) and are parameterized with `{{ customerName }}`, `{{ orderNumber }}`, `{{ totalAmount }}`. Every send uses the branded HTML template with the logo header.
- **Files:** `server/services/quick-emails.ts`, `server/services/notifications.ts`
- **Rules:** Lifecycle triggers: `draft→pending` (confirmation), `pending→confirmed` (payment received), `confirmed→delivered` (all set), balance reminder every 3 days until paid. Every send logged to `emailLogs`. Brevo sends from Render (whitelisted IP) — local sandbox sends fail 401. Customer opt-out via footer link flips `customers.emailOptOut`.

### 11.19 AI chat (Misty pattern)
- **Pattern:** Visitor-keyed memory (1-year cookie or hashed IP). GPT-5 default. Persistent transcript per visitor. Same product-search matcher as the customer-facing search (do NOT let them drift).
- **Files:** `server/ai-chat.ts`, `server/agents/index.ts`, `client/src/pages/chat.tsx`
- **Rules:** Memory persisted to `misty_chat_messages` (visitor_key, role, content, turn_index). Max 50-message history, 4000 output-token budget. Intent expansion maps soft queries (boy/girl/pink/superhero) to product tags. Greeting includes holiday detection. PII scrubbed before storage. Read-only Q&A — no booking/payment from chat.

### 11.20 Outreach system
- **Pattern:** `partner_outreach` table + admin UI at `/dubd43admin/partners` (or `/dubd43admin/backlink-outreach` for SEO). Multiple pitch templates branched on `organization_type`. Bulk select-all + send-N with throttle.
- **Files:** `shared/schema.ts` (partnerOutreach), `client/src/pages/admin-partners.tsx`, `client/src/pages/admin-backlink-outreach.tsx`
- **Rules:** Status enum: `not_contacted | contacted | replied | link_placed | rejected`. Pitch templates pre-seeded in `server/production-migration.ts`. COI send is a separate button for orgs that need an insurance attachment (parks, schools, churches). Throttle 600ms between sends; Brevo IP whitelist required.

### Universal design philosophies across all 20 systems
- **localStorage for session persistence; server-side for authority.** Never trust client math on pricing, availability, or totals.
- **Status enums drive state machines.** Order, driver stop, outreach, payment all use string enums with explicit allowed transitions.
- **Fire-and-forget logging.** Activity, email, system logs never throw; they catch + console.error so the request that triggered them never fails.
- **Same matcher everywhere.** Customer search, admin search, AI chat — one shared code path. Drift is a bug.
- **Dropdowns over visual pickers.** Year/month/day dropdowns load faster, work on every device, and convert better than visual calendars for booking flows.
- **One coupon per customer at a time.** No stacking. No simultaneous grant + global. Always validate against `hasPackages` first.
- **One bundled PR over many tiny ones for refactors.** (Per Dominic's feedback memory.)

---

## How to use this prompt

**At the start of any new Dominic project:**
1. Paste this document (or its path) into the agent's session as the system/initial instruction.
2. Hand the agent the companion CSV (`SITE_STANDARDS_FOR_AGENTS.csv`) for quick rule lookup.
3. Confirm the agent has acknowledged the source-of-truth hierarchy (Section 1.1) and the SEO non-negotiables (Section 2.1) before letting it write code.

**On an existing Dominic project:**
- This prompt is already in effect. Any agent reading the repo treats `docs/SITE_STANDARDS_FOR_AGENTS.md` as binding the moment it loads the project.

**When the rules change:**
- Updates go through Dominic. Date the change and bump the "Last updated" header at the top.
- A new lesson file in `docs/seo-learnings/lessons/` is the canonical way to override or extend a rule here — that file then becomes the source of truth, and this document is updated to reference it.
