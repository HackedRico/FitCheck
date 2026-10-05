from __future__ import annotations

# =============================================================================
# Module Overview
# =============================================================================
# The exceptions adapters and the engine raise. The HTTP layer maps each class to
# one status code, so an adapter picks the class by what the caller should do next.


class FitCheckError(Exception):
    """Base class for every error FitCheck raises on purpose."""


class InvalidInput(FitCheckError):
    """The caller sent something unusable, such as a non-image upload. Maps to HTTP 400."""


class NotFound(FitCheckError):
    """The requested owner or garment does not exist. Maps to HTTP 404."""


class TaggingFailed(FitCheckError):
    """The vision model answered, but not with valid garment tags. Maps to HTTP 422."""


class AdapterUnavailable(FitCheckError):
    """A model server, GPU worker or database is down or misconfigured. Maps to HTTP 503."""
