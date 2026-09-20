# Affiliate program

Clients and publishers can enroll from `/affiliate`. Admins manage the program in
`/admin/affiliates`, configure it in `/admin/settings`, and review withdrawals in
`/admin/withdrawals` (affiliate requests are labeled).

- Default: enabled, 10% of the platform's publication margin (not gross payment).
  A $50 publication with a $40 publisher share earns a $1 affiliate commission.
- The first referral link is saved in the visitor's browser for 30 days. Only new
  client registrations are attributed; publisher signups and existing accounts
  are not. Browser storage must be available for attribution across visits.
- Attribution is immutable, enrollment codes are random, and clients cannot
  specify a commission amount or recipient. Do not promise anti-fraud detection
  across multiple accounts: identity review remains an administrative task.
- The rate is snapshotted when an app is submitted. Turning the program off stops
  new enrollment/attribution and gives new orders a zero rate; existing order
  commitments still settle. Legacy orders without a rate do not earn commissions.
- Commission is issued atomically with successful publication settlement after
  verification and the existing objection period, once per order. No earnings
  for deposits, signups, renewals, updates, cancellations, disputed orders, or
  orders where the affiliate is also the publishing supplier.
- Earnings use a separate ledger account, so service deposits cannot be cashed
  out as affiliate funds. Existing minimums, fees, network validation, CSRF,
  session checks and admin withdrawal approval apply. Transfers remain manual.
- A suspended referred customer blocks new and pending affiliate payouts until
  admin review; Whop's existing refund/dispute handler suspends the customer.
  Already paid external transfers cannot be reversed automatically. Admins must
  resolve the underlying payment risk before reactivating a customer.
- No new environment keys or migrations are required: records and ledger tables
  in the existing private PostgreSQL schema are used. Deploy this branch through
  the normal application deployment flow.

Verification: `npm test`, `npm run check`, `npm run build`.
