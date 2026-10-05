# FitCheck

A shopper stands in a store holding one garment and asks "should I buy this?". FitCheck answers against what they already own, the coming week's weather and their plans, and shows the garment on them.

## Language

### People and things

**Owner**:
The person whose closet, photo and plans FitCheck reasons about.
_Avoid_: user, account, customer

**Garment**:
One piece of clothing with its tags, either in a closet or being considered.
_Avoid_: item, product, clothing article

**Closet**:
Every garment one owner already has.
_Avoid_: wardrobe, inventory

**Candidate**:
The garment the owner is deciding whether to buy.
_Avoid_: target, new item, scanned item

**Person photo**:
A photo of the owner's body, kept on their device and sent only to the renderer; the engine never stores it.
_Avoid_: selfie, user image, body scan

### Seeing the garment

**Scan**:
Capturing a candidate with the camera and reading its tags.
_Avoid_: capture, upload, detection

**Shop link**:
A product page or image address pasted to bring in a garment; the engine fetches the page's main image.
_Avoid_: URL import, product link

**Closet scan**:
One photo of a rack or closet from which every garment is found, tagged and added to the closet.
_Avoid_: bulk upload, batch scan

**Tags**:
The fixed set of facts read off a garment image: category, color family, pattern, warmth, waterproof, formality and a short description.
_Avoid_: labels, attributes, metadata

**Cutout**:
A garment image with hanger and background made transparent.
_Avoid_: mask, segmentation, crop

**Live preview**:
The cutout pinned to the owner's body on the live camera feed, tracking their pose in real time on the device.
_Avoid_: hologram, AR mode, overlay

**Outfit**:
The garments worn together in the live preview: at most one per body region, so a top with a bottom, or one dress. Any garment can be in it: the candidate, a closet garment, or one brought in by shop link or photo.
_Avoid_: look, ensemble

**Render**:
A try-on image of the candidate, or of a whole outfit, on the owner, painted by a diffusion model from a person photo. An outfit takes one pass per garment, bottoms first. While the renderer is unavailable, a flat composite labelled "preview" stands in.
_Avoid_: try-on result, generation, preview

### Deciding

**Verdict**:
The answer for one candidate: BUY, SKIP or TRY-WITH, with its reasons.
_Avoid_: recommendation, score, rating

**Duplicate**:
A closet garment so close to the candidate that buying it adds nothing: same category, same color family, same pattern, formality within one.
_Avoid_: similar item, match

**Pairing**:
A closet garment the candidate can be worn with: a complementary category at a close formality.
_Avoid_: match, combo, outfit suggestion

**Statement piece**:
A candidate in mixed colors or a loud print (floral, graphic, other); it needs a gap to earn BUY.
_Avoid_: bold item

**Gap**:
A need in the coming week that nothing in the closet covers, such as rain with no waterproof outerwear, or a formal event with nothing formal enough.
_Avoid_: missing item, hole

**Week**:
The forecast and calendar events for the coming days that a verdict weighs.
_Avoid_: context, schedule

**Occasion**:
A calendar event with an inferred dress code from 1, gym, to 5, black tie.
_Avoid_: meeting, appointment

**Stylist**:
The chat voice that explains a verdict from the facts it is given and can ask for a render.
_Avoid_: assistant, bot, chatbot, AI

### Running it

**Pipeline**:
The ordered steps that ran for one request, each with its model, license and where it ran.
_Avoid_: trace, log, provenance

**Open path**:
Running FitCheck on open-weight models and an open-source database, with no proprietary data platform.
_Avoid_: local mode, OSS mode

**Snowflake path**:
Running FitCheck with the closet, search and stylist in Snowflake, while vision and try-on stay on open-weight models outside it.
_Avoid_: cloud mode, enterprise mode
