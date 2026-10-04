from __future__ import annotations

import logging
from collections.abc import Callable
from threading import Lock
from time import monotonic

from fitcheck.domain import AdapterInfo, TryOnRequest, TryOnResult
from fitcheck.errors import AdapterUnavailable
from fitcheck.ports import TryOnRenderer

log = logging.getLogger(__name__)

# =============================================================================
# Module Overview
# =============================================================================
# `FallbackRenderer` tries a primary renderer and, when it raises `AdapterUnavailable`
# (quota spent, queue full, timeout, Space down), renders with a backup instead. After a
# failure it skips the primary for `cooldown_s`, so a spent quota or a stuck queue costs
# one slow call, not one per render. Bad input still propagates: the backup cannot fix it.


class FallbackRenderer:
    """Render with `primary`, and with `backup` while `primary` is unavailable."""

    def __init__(
        self,
        primary: TryOnRenderer,
        backup: TryOnRenderer,
        *,
        cooldown_s: float = 300.0,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if cooldown_s < 0:
            raise ValueError("cooldown_s must be zero or positive")
        self._primary = primary
        self._backup = backup
        self._cooldown_s = cooldown_s
        self._clock = clock
        self._skip_until = 0.0
        # FastAPI runs sync routes on a thread pool; guard the shared cooldown deadline
        self._lock = Lock()
        # The pipeline records this before the call, so it names both and keeps the
        # primary's `runs_on`: the privacy badge must warn whenever the photo may leave
        self.info = AdapterInfo(
            name=f"{primary.info.name}, {backup.info.name} as fallback",
            model=primary.info.model,
            license=primary.info.license,
            runs_on=primary.info.runs_on,
        )

    def render(self, request: TryOnRequest) -> TryOnResult:
        """Return the primary's render, or the backup's while the primary is unavailable."""
        if self._cooling_down():
            return self._backup_render(request)
        try:
            return self._primary.render(request)
        except AdapterUnavailable as exc:
            with self._lock:
                self._skip_until = self._clock() + self._cooldown_s
            log.warning(
                "[FallbackRenderer] %s unavailable; rendering with %s for the next %.0fs. "
                "Reason: %s",
                self._primary.info.name,
                self._backup.info.name,
                self._cooldown_s,
                exc,
            )
            return self._backup_render(request)

    def _backup_render(self, request: TryOnRequest) -> TryOnResult:
        """Render with the backup and mark it, so the app can offer something better."""
        return self._backup.render(request).model_copy(update={"fallback": True})

    def _cooling_down(self) -> bool:
        """Return True while the primary failed less than `cooldown_s` ago."""
        with self._lock:
            return self._clock() < self._skip_until
