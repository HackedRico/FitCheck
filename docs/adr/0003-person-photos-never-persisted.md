# Person photos are never persisted

A person photo lives in request memory and goes only to the try-on renderer. No adapter writes it to disk, a database, Snowflake or a log, and the engine stores garment cutouts only. This is the answer to "why not one Gemini call?": the body photo does not leave hardware we control. Every adapter declares `runs_on`, and the UI shows a warning when a step that touched the person photo ran on a public API, which the `hf_space` try-on adapter does.
