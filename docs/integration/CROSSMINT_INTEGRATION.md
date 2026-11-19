# Crossmint integration — fiat on-ramp with private delivery

**Status (2026-11-19): built and deployed on the Dark hub; one key-scope
step remains before the first live order completes.**

Dark Protocol's privacy only helps if people can get *into* the pool
without first making a fully public crypto purchase. The Crossmint rail
is the entry point: a buyer pays by card, and USDC on Solana is delivered
for private use — no exchange account, no public funding trail from a
known exchange wallet.

## What is built

- **Confidential onramp (live code, deployed 2026-11-17)** on the x402
  Dark hub: Crossmint card checkout with `delivery="private"`. The flow
  links the house wallet to the buyer and creates a real card order for
  USDC on Solana, with the house wallet as recipient.
- **Order creation is real, not mocked** — the endpoint performs wallet
  linking and order creation against the production Crossmint API.
- **Offramp** shipped alongside it; settlement is deliberately gated
  off (`RAMP_SETTLEMENT_ENABLED` unset) until the onramp completes a
  live order end to end.
- Crossmint embedded wallets also power the Clawd Compute wallet page
  (email sign-in creates a Crossmint Solana smart wallet), so the same
  identity can hold the keys that later make shielded deposits.

## Live test result (2026-11-18)

- Wallet linking: **succeeded**.
- Order creation: **rejected on key scope** — the production server key
  carries `orders.read` + `orders.update` but not `orders.create`.

## Remaining step

One console action, no code change: issue an `orders.create`-scoped
server key and set it as `CROSSMINT_API_KEY` on the hub. After that, the
next live test is a small real card order verified against the delivered
USDC on-chain.

## Where it fits

Card → USDC (Crossmint) → shielded deposit (Dark Protocol pool /
Helius Privacy Rings). The ramp is the top of the funnel for Dark
Payments and the private x402 surfaces; it is a payments integration,
not a custody product — settlement stays gated until it has completed
real orders under observation.
