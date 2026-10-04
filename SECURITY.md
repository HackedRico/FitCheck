# Security

FitCheck runs on your own machine and holds a closet, garment images and, in memory only, a person photo. This is what it defends against, what it does not, and how to report something.

## Reporting

Open a private security advisory on the GitHub repository rather than a public issue. Include what you did and what happened; a proof of concept helps.

## What the engine assumes

The engine has no accounts and no sessions. Every route acts on the owner named in the path, so **anything that can reach the port can read, change and delete any closet**, including `DELETE /closet/{owner}`.

`fitcheck serve` binds `0.0.0.0` so a phone on the same wifi can reach it, which also means everyone else on that wifi can. On a shared network, such as a campus, conference or cafe:

```sh
fitcheck serve --host 127.0.0.1
```

and reach the phone through a tunnel instead (`web/README.md`). Treat the engine as a personal service on a network you trust. Do not put it on the public internet without a reverse proxy that adds authentication.

## What it does defend

**Browsers.** The API has no accounts, so the origins allowed to call it are the only guard. `cors_origins` and `cors_origin_regex` default to localhost, private network addresses and the tunnels the readme suggests. A page on any other origin cannot read a closet or delete one. Set `FITCHECK_CORS_ORIGINS` to widen it only if you know why.

**Person photos.** A person photo lives in request memory and goes only to the try-on renderer. Nothing writes it to disk, a database, Snowflake or a log (ADR 0003). The one exception is `hf_space`, which must hand `gradio_client` a file path: it writes into a private temporary folder and deletes it in a `finally` block. Every adapter declares `runs_on`, and the UI warns when a step that touched the person photo ran on a public API.

**Links people paste.** `POST /link` fetches a URL someone gives it, which is a request the server makes on their behalf. Before each hop the host is resolved and every address it answers with must be public, redirects are followed by hand so each one is checked again, and the connection is then made to the address that was checked rather than resolving the name a second time, which is what stops DNS rebinding. Responses are capped at 12 MB, redirects at 5, and the image is re-encoded through Pillow so what reaches the closet is a plain PNG.

**Paths and queries.** Owner names must match `[a-z0-9][a-z0-9_-]{0,63}`, and a stored image path is resolved and checked to be inside the image folder, so a crafted reference cannot read elsewhere. Every SQL statement binds its values.

**Request size.** Bodies over 25 MB are refused with 413 before being read.

## What it does not defend

- **Anything that reaches the port.** There is no authentication, so network reach is the whole access control. See above.
- **A malicious shop page.** A link import fetches whatever the page offers as its image. It is re-encoded, but the engine still made a request to a third party that the person chose.
- **Rate limiting.** Nothing limits how often a route is called. A local service does not need it; an exposed one would.
- **The models.** A tagger or stylist answer is validated for shape, not for truthfulness, and the verdict never depends on it (ADR 0002).

## Secrets

Keys live in `engine/.env`, which git ignores, and are read through `Settings` as `SecretStr`. `engine/.env.example`, `env/open.env` and `env/snowflake.env` are tracked and hold adapter switches and empty placeholders only. Private keys (`*.p8`) and the Snowflake public key are ignored. No key has ever been committed; the history was checked.

## Checking it yourself

```sh
make check                        # lint, types and tests
cd web && npm audit               # web dependencies
```

Python dependencies are pinned in `engine/uv.lock` and can be checked against the OSV database.
