# Security

## Reporting a vulnerability

Report it privately through GitHub: on the repository's Security tab, choose "Report a vulnerability". Please do not open a public issue. Say what you did, what happened and what you expected; a proof of concept helps.

## Scope

In scope:

- The engine in `engine/`, its HTTP API and CLI
- The web app in `web/`
- The try-on worker in `worker/`
- Any way a person photo could be written, logged or sent somewhere other than the try-on renderer

Out of scope, because they are known and documented below: anything that follows from the engine having no authentication, missing rate limits, and what a third-party model or service does with data FitCheck sent it on purpose.

## The person-photo promise

A person photo is a photo of the owner's body. It stays on the phone, in the browser's IndexedDB, until the owner asks for a render. The engine then holds it in request memory and passes it only to the try-on renderer. Nothing writes it to disk, a database, Snowflake or a log (ADR 0003). The one exception is the `hf_space` adapter: `gradio_client` needs a file path, so it writes the photo into a private temporary folder and deletes it in a `finally` block.

Where the renderer runs decides who else sees the photo. `overlay` keeps it on this machine, `remote` sends it to a worker you run, and `hf_space` sends it to the public Leffa Space on Hugging Face. Every adapter declares `runs_on`, and the UI warns when a step that touched the person photo ran on a public API. A bug that breaks any of this is a vulnerability.

## What the engine assumes

The engine has no accounts. Every route acts on the owner named in the path, so anything that can reach the port can read, change and delete any closet. `fitcheck serve` binds `0.0.0.0` so a phone on the same wifi can reach it. On a shared network, run `fitcheck serve --host 127.0.0.1` and reach it through a tunnel (`web/README.md`). Do not expose it to the internet without a reverse proxy that adds authentication.

## What it does defend

- **Browsers.** CORS allows only localhost, private network addresses and the tunnel hosts the web readme names, so a page on another origin cannot read or delete a closet.
- **Shop links.** `POST /link` checks that every address a host resolves to is public before each hop, follows redirects by hand, and connects to the address it checked, which stops DNS rebinding. Responses cap at 12 MB and 5 redirects, and the image is re-encoded as PNG.
- **Paths and queries.** Owner names must match `[a-z0-9][a-z0-9_-]{0,63}`, stored image paths must resolve inside the image folder, and every SQL statement binds its values.
- **Request size.** Bodies over 25 MB get 413 before they are read.

## Secrets

Keys live in `engine/.env`, which git ignores, and load through `Settings` as `SecretStr`. The tracked `engine/.env.example`, `env/open.env` and `env/snowflake.env` hold switches and empty placeholders only. Private keys (`*.p8`) are ignored too.
