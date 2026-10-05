# Demo

`closet.json` is the seed closet for the demo owner, `ricky`: 15 garments. The default sqlite store loads them into `.fitcheck/closet.db` only when that database is empty, the memory store loads them on every start, and `fitcheck seed` loads them into Postgres or Snowflake. Against the default weather and calendar fixtures it gives the stage script:

| Candidate | Verdict | Why |
| --- | --- | --- |
| Yellow raincoat, outerwear, waterproof, formality 2 | BUY | Rain on 3 of 7 days and Ricky owns no waterproof outerwear; pairs with 10 garments, black jeans included |
| Navy crewneck, sweater, formality 2 | SKIP | Ricky owns 3 navy sweaters at formality 2 and 3 |
| Bold floral shirt, multi, formality 3 | TRY_WITH | Statement piece; best pairing is the black straight-leg jeans |

The black blazer, formality 4, and white oxford shirt, formality 3, keep the job interview from opening an event gap. `engine/tests/verdict/test_demo_closet.py` checks all of this, so run it after any edit here.

## Adding real photos

1. Put one JPEG or PNG per garment in `demo/images/`, named after the garment id, for example `demo/images/ricky-black-jeans.jpg`, and add its license and author to `ATTRIBUTION.md`.
2. Set that garment's `image_ref` to `"seed/ricky-black-jeans.jpg"`. The `seed/` prefix tells the engine to read from `demo/images/` instead of the data folder.
3. Delete `.fitcheck/closet.db` (the demo closet only loads into an empty database) and restart the engine. `GET /closet/ricky/ricky-black-jeans/image` should return the photo.

Use garment photos only: a garment on a hanger, a mannequin, or a body with no face showing. Never put an owner's person photo here; those stay on their device (ADR 0003).

The current photos come from Wikimedia Commons; `images/ATTRIBUTION.md` lists the source, author, license and changes for each one.
