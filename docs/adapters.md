# Adding an adapter

An adapter fills one slot of the engine: `store`, `tagger`, `cutout`, `tryon`, `weather`, `calendar` or `stylist`. The slot's `Protocol` in `engine/src/fitcheck/ports.py` is the whole contract. Callers never import an adapter directly; `wiring.py` loads it by name.

## Steps

1. Create a module in the slot's package, for example `engine/src/fitcheck/tryon/my_renderer.py`. It holds a class with an `info: AdapterInfo` attribute and the slot's methods, and a module-level `build(settings: Settings)` that returns an instance.
2. Add the name to the slot's `Literal` in `settings.py` (and to `tryon_fallback` for a try-on adapter), to `ADAPTERS` in `wiring.py`, and to the slot's comment in `engine/.env.example`.
3. Put new config on `Settings` as a field; it reads from `FITCHECK_<FIELD>`. Type secrets as `SecretStr`.
4. Import any optional dependency inside `build` or the method that needs it, and add it as an extra in `engine/pyproject.toml`. The core must import with no extras installed.
5. Translate failures into `fitcheck.errors`: a down or misconfigured service raises `AdapterUnavailable`, unusable model output raises `TaggingFailed`. Let programming errors propagate.
6. Set `info.runs_on` to where the work really happens. Anything that sends data to someone else's server is `PUBLIC_API`.
7. Test it in `engine/tests/<area>/`: unit tests with mocked HTTP (`respx`) or fakes, plus one `@pytest.mark.live` test against the real service. A new closet store subclasses `ClosetStoreContract` from `tests/support/closet_contract.py`, so it behaves exactly like the memory and sqlite stores.
8. Add a row to `THIRD_PARTY_LICENSES.md` for any model, dataset or service it uses.

## Rules every adapter keeps

- A try-on adapter keeps the person photo in memory and never logs request bodies (ADR 0003). If a client library will only take a file path, as `gradio_client` does in `hf_space`, write to a `tempfile.mkdtemp` folder and remove it in a `finally` block.
- A stylist adapter builds its prompt with `fitcheck.stylist.prompts` and a tagger with `fitcheck.vision.prompts`, so every model sees the same facts and answers in the same shape.
- An adapter holds no verdict logic. If a rule changes, it changes in `fitcheck.verdict`.
