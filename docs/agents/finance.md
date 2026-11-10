# Finance agent (proposed 10 Nov 2026)

Monthly money check. Read-only. Not accountancy advice; flags what to raise with an accountant.

## Sources
- Etsy: payments and ledger via the Make Etsy tool (scenario 7705176), e.g. `/shops/65435151/payment-account/ledger-entries`, `/shops/65435151/receipts`. Fees: listing, transaction 6.5%, payment processing, offsite ads, VAT on fees.
- Printify: order costs and postage (`/shops/27154106/orders.json`).
- Own shop: Stripe (test mode until launch), KV `shop:orders`.
- Make: monthly operations used (organization usage).
- Core: PRICING / PRODUCT_RULES for list prices.

## Monthly report (`docs/finance/YYYY-MM.md`)
1. Sales: orders, items, revenue by collection and garment, Etsy vs own shop.
2. Costs: Printify production + postage, Etsy fees, Stripe fees, ads, subscriptions (Make, Canva, Claude, domains).
3. Profit per item and per collection; anything selling at a loss or thin margin.
4. Trends vs last month; best and worst sellers.
5. VAT watch: rolling 12-month turnover vs the UK VAT threshold, with a warning at 75%.
6. Tax-year running totals (6 April to 5 April) to make Self Assessment easy.
7. Questions for Barry (with recommendations).

## Never
- Move money, change prices, refund or cancel orders.
