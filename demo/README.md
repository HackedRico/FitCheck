# Demo

`closet.json` is Maya's seed closet: 15 garments that `fitcheck.seed.load_seed` loads into the memory store at startup. Against the default weather and calendar fixtures it gives the stage script:

| Candidate | Verdict | Why |
| --- | --- | --- |
| Yellow raincoat, outerwear, waterproof, formality 2 | BUY | Rain on 3 of 7 days and Maya owns no waterproof outerwear; pairs with 10 garments, black jeans included |
| Navy crewneck, sweater, formality 2 | SKIP | Maya owns 3 navy sweaters at formality 2 and 3 |
| Bold floral shirt, multi, formality 3 | TRY_WITH | Statement piece; best pairing is her black straight-leg jeans |

Her black blazer, formality 4, and white oxford shirt, formality 3, keep the job interview from opening an event gap. `engine/tests/verdict/test_demo_closet.py` checks all of this, so run it after any edit here.

## Adding real photos

1. Put a cutout PNG per garment in `demo/images/`, named after the garment id, for example `demo/images/maya-black-jeans.png`.
2. Set that garment's `image_ref` to `"seed/maya-black-jeans.png"`. The `seed/` prefix tells the engine to read from `demo/images/` instead of the data folder.
3. Restart the engine. `GET /closet/maya/maya-black-jeans/image` should return the photo.

Use garment photos only. Never put a person photo in this folder.
