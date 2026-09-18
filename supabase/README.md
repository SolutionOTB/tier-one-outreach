# Supabase pieces for Tier One Outreach

Project `pytbtuzeeguqgrhszmpr`, shared with other apps, so every object here is prefixed `to_`.
These files are the record of what is deployed. Deploy through the Supabase dashboard or the
Supabase MCP, then keep the file here in step with it.

* `migrations/20260918_to_suppressed_emails.sql`: the generic unsubscribe list and the
  `to_suppressed_among` lookup, which only answers for the caller's own contacts.
* `functions/unsub-email/index.ts`: takes a POST from `unsubscribe.html` and adds the address to the
  list. `verify_jwt` is off because a consumer clicks it. The service role key comes from the function
  environment.

The older `unsub` function (per contact token) is deployed but not saved here yet.
