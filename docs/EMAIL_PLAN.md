# Email: reaching a reader

Written 2026-11-10. Nothing in the site can send a message today. The plan in [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md) needs three kinds: a welcome, a
streak reminder, and a weekly "what is new". The owner's constraint: **free for now.**

## Can Cloudflare send it for free? No.

Read from Cloudflare's own pricing and limits pages on 2026-11-10:

- **Email Sending** (the part that sends to any address) needs the **Workers Paid plan**: $5 a month, which includes 3,000 emails a month, then $0.35 per
  1,000. The Workers Free plan cannot send outbound email.
- What is free on every plan: sending **to addresses you have verified in your own account** (a handful, up to 200). That is useful for alerts to yourself,
  not for readers.
- **Email Routing** (the free feature most people mean) only *receives* and forwards mail. It cannot send to readers.
- New accounts start with a daily quota that rises with good behaviour; Cloudflare publishes no number.

So Cloudflare is the cheapest *paid* option and not a free one.

## What is free

| Provider | Free allowance | Limit that bites | Notes |
|---|---|---|---|
| **Resend** | 3,000 emails a month, 100 a day, no card | 100 a day: a weekly digest to more than 100 people has to be spread over days | One verified domain on the free plan; simple HTTP API. Figures are from third-party pages and disagreed in places: check resend.com/pricing |
| Other free tiers (Brevo, MailerLite, Amazon SES with its small free usage) | vary | vary | Not checked in detail |

**Recommendation: Resend's free plan to start.** At the size this site will be for the next months (hundreds of subscribers, one digest a week and a few
reminders) 3,000 a month is enough if the digest is spread; when the list passes about 100 weekly recipients or the daily cap hurts, move to Cloudflare Email
Sending ($5 a month for 3,000) or Resend's paid plan. The code is written so the provider is one setting, and changing it is not a rewrite.

## What you do (I cannot, and should not, do these for you)

1. Create a Resend account (free).
2. In Resend, add the sending domain (a subdomain such as `mail.backendroadmap.com` is best: it keeps the main domain's reputation separate).
3. Resend shows DNS records to add (SPF, DKIM and a return path). Add them in Cloudflare DNS (they must be "DNS only", not proxied).
4. Create an API key in Resend with "sending access" only.
5. Put the key into the Cloudflare Pages project as an encrypted environment variable named `RESEND_API_KEY`, and the from-address as `EMAIL_FROM`.
6. Approve the wording on the privacy page (below).

Until step 5 is done the code does nothing: no key, no mail. That is deliberate (the same pattern as the writing assistant).

## What I build (code and tests; nothing sends until you add the key)

**Data (migration 0008, additive, applied by you with `npm run db:migrate:remote` before the code is deployed):**
`email_subscribers` (id, email, user id if signed in, status `pending` / `active` / `unsubscribed`, the kinds they chose, when they consented and from which
page, a secret token for confirm and unsubscribe links), and `email_log` (what was sent to whom and when, to stop a message going out twice).

**Rules that make it legal and decent** (these are not optional):
- **Double opt-in.** Signing up sends one message with a confirm link; nobody is added to the list until they click it. This protects the sender
  reputation (no typos, no one signed up by someone else) and satisfies the consent rules most places have (GDPR, India's DPDP Act, CAN-SPAM's unsubscribe
  duty).
- **One-click unsubscribe** in every message: a link and the `List-Unsubscribe` header. It works without signing in.
- **Kinds are separate.** A reader chooses: "the weekly digest", "a streak reminder", or both. A signed-in reader's account settings have the same switches.
- **No tracking pixels, no click redirects.** The privacy page can then say so.
- **Never send to an address that bounced or complained** (Resend reports them; the code records and respects it).
- The address is not shown to anyone else, is deleted with the account, and is deleted on unsubscribe if the reader asks.

**Sending:**
- A provider-neutral `sendEmail({ to, subject, text, html, headers })` in `api/lib/email/` with a Resend implementation (one HTTP call, no library) and a test
  double; a Cloudflare implementation can be added behind the same function.
- **Scheduling.** Cloudflare Pages Functions have no timers, so a scheduled GitHub Actions workflow calls a protected endpoint (a shared secret in the
  header) once a day. It decides what is due: the streak reminders (readers whose streak ends today and who have not been reminded), and on the chosen day
  the weekly digest. It sends at most the daily cap and carries the rest to the next day.
- **The digest** is built from facts the site already has, so there is nothing to write each week: the videos that went public this week, the next
  video's date (from `content/videos.json`), the lessons added, and one practice item. Plain text first, simple HTML second.
- **Signed-out sign-up box** (and one in the first-visit home page and the foot of a lesson) that asks for an address and the kind of mail, and says what
  happens next.
- **An admin screen:** the number of active, pending and unsubscribed addresses, the last sends, and a "send me a test" button.

**Tests:** the double opt-in (no confirm, no mail), unsubscribe, the daily cap and carry-over, no duplicate sends, bounce handling, the message text, and
that with no key nothing leaves the building.

## Privacy and terms (needs your approval before it goes live)

The privacy page must say, in plain words: what is collected (the address, the kinds chosen, the time and page of consent), what for (only the messages
chosen), who processes it (the email provider, named), that every message can be unsubscribed from in one click, that no tracking is used, and how to have
the address deleted. I will draft the wording in `docs/PRIVACY-TERMS-DRAFT.md`; I will not change `webapp/public/privacy.html` until you approve it.

## The order

1. You: create the Resend account and the domain records (30 minutes, then wait for DNS).
2. Me: the migration, the code and tests, dormant. You: apply the migration, approve the privacy wording, add the key.
3. First real use: a message to yourself and one or two friends (the confirm flow and the unsubscribe link, end to end, in a real inbox).
4. Open the sign-up box.

The code can be built before step 1; only step 3 needs the account.
