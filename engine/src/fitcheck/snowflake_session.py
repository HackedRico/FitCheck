from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from threading import Lock
from typing import Any, Protocol, cast

from fitcheck.errors import AdapterUnavailable
from fitcheck.settings import Settings

# Unquoted Snowflake identifier; names from settings land in SQL text, so nothing else passes
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]{0,254}$")
# Fail fast on a wrong account name instead of waiting out the connector's 120 s default
_LOGIN_TIMEOUT_S = 30
# Tags every statement, so QUERY_HISTORY and the cost views can split FitCheck's spend out
_QUERY_TAG = "fitcheck"
# First matching prefix wins; a model missing here reports no license rather than a guess
_LICENSE_BY_PREFIX: tuple[tuple[str, str], ...] = (
    ("llama4", "Llama 4 Community License"),
    ("llama3.3", "Llama 3.3 Community License"),
    ("llama3.1", "Llama 3.1 Community License"),
    ("qwen3", "Apache-2.0"),
    ("claude", "Proprietary"),
    ("openai", "Proprietary"),
    ("gemini", "Proprietary"),
)

# =============================================================================
# Module Overview
# =============================================================================
# The one place the Snowflake path signs in. `connect_kwargs` turns `Settings` into
# connector arguments or raises `AdapterUnavailable` naming the env vars to set;
# `SnowflakeSession` opens one shared connection lazily and hands out cursors whose
# failures become `SnowflakeQueryFailed`. The Cortex helpers below serve both AI adapters.


# =============================================================================
# Connector seams
# =============================================================================


class Cursor(Protocol):
    """The slice of a Snowflake cursor the adapters use; tests pass a recording fake."""

    @property
    def rowcount(self) -> int | None:
        """Rows the last DML statement changed, or `None` when unknown."""
        ...

    def execute(self, command: str, params: Mapping[str, Any] | None = None) -> object:
        """Run one statement with pyformat `params`."""
        ...

    def fetchone(self) -> Sequence[Any] | None:
        """Return the next result row, or `None` when there is none."""
        ...

    def fetchall(self) -> Sequence[Sequence[Any]]:
        """Return every remaining result row."""
        ...

    def close(self) -> object:
        """Release the cursor."""
        ...


class Connection(Protocol):
    """The slice of a Snowflake connection the session uses."""

    def cursor(self) -> Cursor:
        """Return a new cursor on this connection."""
        ...

    def is_closed(self) -> bool:
        """Return whether the connection has closed or expired."""
        ...


class SnowflakeQueryFailed(AdapterUnavailable):
    """A statement failed in Snowflake, such as a missing table, stage, service, model or grant."""


# =============================================================================
# Session
# =============================================================================


class SnowflakeSession:
    """One lazily opened Snowflake connection, shared by the closet store, tagger and stylist."""

    def __init__(self, settings: Settings, connect: Callable[[], Connection] | None = None) -> None:
        kwargs = connect_kwargs(settings)
        self.database = settings.snowflake_database
        self.schema = settings.snowflake_schema
        # Account and database only: errors must never carry the password or key passphrase
        self._target = f"{settings.snowflake_account}/{self.database}.{self.schema}"
        self._connect = connect or (lambda: _open_connection(kwargs))
        self._conn: Connection | None = None
        # FastAPI runs sync routes on a thread pool; two first requests must not both sign in
        self._lock = Lock()

    def qualify(self, name: str, env: str) -> str:
        """Return `name` as `DATABASE.SCHEMA.NAME`, after checking each part is an identifier."""
        parts = name.split(".")
        if len(parts) > 3:
            raise AdapterUnavailable(f"`{env}` has more than three dotted parts: `{name}`.")
        for part in parts:
            require_identifier(part, env)
        # A bare name lives in the session's schema; `SCHEMA.NAME` in the session's database
        prefix = [self.database, self.schema][: 3 - len(parts)]
        return ".".join([*prefix, *parts])

    @contextmanager
    def cursor(self) -> Iterator[Cursor]:
        """Yield a fresh cursor; connector errors inside the block become `SnowflakeQueryFailed`."""
        cursor = self._connection().cursor()
        try:
            yield cursor
        except _connector_errors() as exc:
            raise SnowflakeQueryFailed(
                f"Snowflake query on `{self._target}` failed: {exc}"
            ) from exc
        finally:
            cursor.close()

    def _connection(self) -> Connection:
        """Return the open connection, signing in first when there is none or it has expired."""
        with self._lock:
            if self._conn is None or self._conn.is_closed():
                try:
                    self._conn = self._connect()
                except _connector_errors() as exc:
                    raise AdapterUnavailable(
                        f"Could not sign in to Snowflake `{self._target}`: {exc}. Check the "
                        "`FITCHECK_SNOWFLAKE_*` values in `engine/.env` (see docs/snowflake.md)."
                    ) from exc
            return self._conn


# internal cache, so the three Snowflake adapters share one sign-in per process
_SESSIONS: dict[tuple[str | None, ...], SnowflakeSession] = {}
_SESSIONS_LOCK = Lock()


def session_for(settings: Settings) -> SnowflakeSession:
    """Return the process-wide session for `settings`' account, user, role and schema."""
    key = (
        settings.snowflake_account,
        settings.snowflake_user,
        settings.snowflake_role,
        settings.snowflake_warehouse,
        settings.snowflake_database,
        settings.snowflake_schema,
    )
    with _SESSIONS_LOCK:
        session = _SESSIONS.get(key)
        if session is None:
            session = _SESSIONS[key] = SnowflakeSession(settings)
        return session


def connect_kwargs(settings: Settings) -> dict[str, Any]:
    """Return `snowflake.connector.connect` arguments, or raise `AdapterUnavailable` naming gaps."""
    password = settings.snowflake_password
    key_path = settings.snowflake_private_key_path
    missing = [
        env
        for env, value in (
            ("FITCHECK_SNOWFLAKE_ACCOUNT", settings.snowflake_account),
            ("FITCHECK_SNOWFLAKE_USER", settings.snowflake_user),
        )
        if not value
    ]
    if key_path is None and password is None:
        missing.append("FITCHECK_SNOWFLAKE_PRIVATE_KEY_PATH (or FITCHECK_SNOWFLAKE_PASSWORD)")
    if missing:
        raise AdapterUnavailable(
            f"The Snowflake path needs {', '.join(missing)}; set them in `engine/.env` "
            "(see docs/snowflake.md)."
        )
    if key_path is not None and not key_path.expanduser().is_file():
        raise AdapterUnavailable(
            f"`FITCHECK_SNOWFLAKE_PRIVATE_KEY_PATH` is `{key_path}`, which is not a file."
        )
    require_identifier(settings.snowflake_warehouse, "FITCHECK_SNOWFLAKE_WAREHOUSE")
    require_identifier(settings.snowflake_database, "FITCHECK_SNOWFLAKE_DATABASE")
    require_identifier(settings.snowflake_schema, "FITCHECK_SNOWFLAKE_SCHEMA")
    if settings.snowflake_role is not None:
        require_identifier(settings.snowflake_role, "FITCHECK_SNOWFLAKE_ROLE")

    kwargs: dict[str, Any] = {
        "account": settings.snowflake_account,
        "user": settings.snowflake_user,
        "warehouse": settings.snowflake_warehouse,
        "database": settings.snowflake_database,
        "schema": settings.snowflake_schema,
        # Client-side binding: values arrive as escaped literals, and SEARCH_PREVIEW
        # accepts constant arguments only, so server-side binds would be refused
        "paramstyle": "pyformat",
        # A demo server idles for hours between visitors; keep the session from expiring
        "client_session_keep_alive": True,
        "login_timeout": _LOGIN_TIMEOUT_S,
        "session_parameters": {"QUERY_TAG": _QUERY_TAG},
    }
    if settings.snowflake_role is not None:
        kwargs["role"] = settings.snowflake_role
    if key_path is not None:
        # A key pair wins: Snowflake now blocks password-only sign-in on most accounts
        kwargs["private_key_file"] = str(key_path.expanduser())
        if settings.snowflake_private_key_passphrase is not None:
            kwargs["private_key_file_pwd"] = (
                settings.snowflake_private_key_passphrase.get_secret_value()
            )
    elif password is not None:
        kwargs["password"] = password.get_secret_value()
    return kwargs


def require_identifier(name: str, env: str) -> None:
    """Raise `AdapterUnavailable` unless `name` is an unquoted Snowflake identifier."""
    if not _IDENTIFIER.fullmatch(name):
        raise AdapterUnavailable(
            f"`{env}` must be a plain Snowflake identifier (letters, digits, `_`, `$`), "
            f"got `{name}`."
        )


def _open_connection(kwargs: Mapping[str, Any]) -> Connection:
    """Sign in with the connector, imported here so the core runs without the `snowflake` extra."""
    try:
        import snowflake.connector
    except ImportError as exc:
        raise AdapterUnavailable(
            "`snowflake-connector-python` is not installed; run `make sync` for the "
            "`snowflake` extra."
        ) from exc
    return cast(Connection, snowflake.connector.connect(**kwargs))


def _connector_errors() -> tuple[type[Exception], ...]:
    """Return the connector's base error class, or nothing when the extra is not installed."""
    try:
        from snowflake.connector.errors import Error
    except ImportError:
        return ()
    return (Error,)


# =============================================================================
# Cortex helpers
# =============================================================================


def cortex_model_license(model: str) -> str | None:
    """Return the license of a Cortex `model`, or `None` when its family is not listed here."""
    name = model.lower()
    return next((lic for prefix, lic in _LICENSE_BY_PREFIX if name.startswith(prefix)), None)


def sql_object_constant(value: Any) -> str:
    """Render code-owned JSON `value` as a Snowflake object constant inside a pyformat statement."""
    if isinstance(value, dict):
        pairs = ", ".join(
            f"{_sql_string(str(k))}: {sql_object_constant(v)}" for k, v in value.items()
        )
        return f"{{{pairs}}}"
    if isinstance(value, list | tuple):
        return f"[{', '.join(sql_object_constant(item) for item in value)}]"
    if isinstance(value, str):
        return _sql_string(value)
    # bool before int: `True` is an `int` in Python but must print as a SQL boolean
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int | float):
        return repr(value)
    if value is None:
        return "NULL"
    raise TypeError(f"Cannot render {type(value).__name__} as a Snowflake constant.")


def completion_text(row: Sequence[Any] | None) -> str:
    """Return the single AI_COMPLETE column of `row` as text, or raise `AdapterUnavailable`."""
    if row is None or not row or row[0] is None:
        raise AdapterUnavailable(
            "Cortex AI_COMPLETE returned nothing; check `FITCHECK_CORTEX_MODEL` is available "
            "in your account's region (see docs/snowflake.md)."
        )
    cell = row[0]
    # Structured output is an OBJECT, which the connector hands over as JSON text
    return cell if isinstance(cell, str) else json.dumps(cell)


def _sql_string(text: str) -> str:
    """Quote `text` as a SQL string literal that survives pyformat's `%` interpolation."""
    escaped = text.replace("\\", "\\\\").replace("'", "\\'")
    # The statement goes through `command % params`, which turns `%%` back into `%`
    return "'" + escaped.replace("%", "%%") + "'"
