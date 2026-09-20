# Context

Glossary for the vyapar-clone domain. Terms only — no implementation detail, no decisions.
Decisions that were hard to reverse live in `docs/adr/`.

## Books and modes

**Books** — the durable record of trade: parties, items, batches, stock levels and
transactions. The thing a mistake is expensive in.

**Live mode** — the app is reading and writing the books. Which *file* holds the live books is
contextual: it is whichever database the app would open with no sandbox in effect.

**Dev mode** — the app is reading and writing a *sandbox copy* of the books, taken at seed time.
Dev is not "test data"; it is a snapshot of real trade that can be freely destroyed. Isolation
covers the books and their snapshots. It deliberately does **not** cover credentials or
preferences, which are shared across modes because they are not books.

**Seeding** — making a dev sandbox by copying the live books into it. A sandbox persists across
mode switches until explicitly reset or re-seeded.

## Documents

**Slip** — a handwritten order, photographed. Carries a party name, a date, and per-line
quantity and amount. It carries no invoice number, no HSN, no GST rate, no batch, and often no
unit rate. A slip is *evidence of an order*, not a document of record.

**Slip total** — the amount handwritten at the foot of the slip. It is the sum of the line
amounts as the writer computed them, and it is understood to be **pre-GST**. Its value is as an
independent check on extraction: if the extracted lines sum to the slip total, the reading of
the quantities and amounts is almost certainly right.

**Invoice total** — what the customer owes: the line amounts plus GST at each item's master
rate. It is normally *higher* than the slip total. The two are different quantities and are
never reconciled against each other.

**Invoice** — a document of record, written into the books, numbered from the books' own
sequence. Generated from a slip; never equal to one.

## Extraction and drafting

**Draft** — the interpretation of a slip after extraction and matching, before anything is
written. A draft is chat state, not books: it is not snapshotted, not rolled back, and does not
survive indefinitely.

**Matching** — resolving a name written on a slip to a record already in the books. A line is
**matched** when a master record has been identified for it, and **unmatched** otherwise.

**Master** — the reference records that transactions point at: the item master (name, HSN, GST
rate, unit, price) and the party master (name, state, GSTIN, contact). Masters are curated on
the desktop. A slip is too weak a source to amend one; billing against a master never changes
it.

## Stock

**Batch** — a tracked lot of an item, with its own expiry and its own quantity on hand. Nearly
all sale lines in the books name one.

**FEFO** — first-expiry-first-out: the earliest-expiring batch with stock is consumed first.

**Split line** — one ordered quantity satisfied from more than one batch, because no single
batch could cover it. Each batch becomes its own line.

## The bot

**Allowlisted chat** — the single Telegram conversation the bot will answer. Anything else is
ignored.

**Generate** — the explicit act, by the operator, of turning a draft into an invoice. It is the
only thing in the flow that writes to books.
