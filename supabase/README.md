# Supabase pieces for Tier One Outreach

Project `pytbtuzeeguqgrhszmpr`, shared with other apps, so every object here is prefixed `to_`.
These files are the record of what is deployed. Deploy through the Supabase dashboard or the
Supabase MCP, then keep the file here in step with it.

* `migrations/20260918_to_suppressed_emails.sql`: the generic unsubscribe list and the
  `to_suppressed_among` lookup, which only answers for the caller's own contacts.
* `functions/unsub-email/index.ts`: takes a POST from `unsubscribe.html` and adds the address to the
  list. `verify_jwt` is off because a consumer clicks it. The service role key comes from the function
  environment.

* `migrations/20260921_to_scans_and_overview.sql`: the QR scan table and `to_admin_overview`, the
  counts behind the admin dashboard. The function answers nothing unless the caller is an admin.
* `functions/r/index.ts`: the QR redirect. It writes one scan row and sends the person to the
  associate's link. QR codes made in the app point here.

The older `unsub` function (per contact token) and the `api` function (used by the training site,
and by QR codes printed before 2026-09-21) are deployed but not saved here yet.
