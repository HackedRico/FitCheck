from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from fitcheck.domain import Garment, GarmentTags

# =============================================================================
# Module Overview
# =============================================================================
# Row mapping shared by the Postgres and Snowflake closet stores, which keep the
# same flat `garments` table. `flatten` turns a `Garment` into one value per column
# and `unflatten` rebuilds it; each store adjusts the few values its driver needs
# in another form. Keys are the lowercase names in `FIELDS`.


# Column order of the SQL stores' `garments` table: `Garment` with its tags flattened.
# owner and id come first because they are the key, which a merge never updates.
FIELDS = (
    "owner",
    "id",
    "source",
    "category",
    "color_family",
    "pattern",
    "warmth",
    "waterproof",
    "formality",
    "description",
    "price",
    "wears",
    "image_ref",
    "source_url",
    "created_at",
)


def flatten(garment: Garment) -> dict[str, object]:
    """Return `garment` and its tags as one value per column, keyed by `FIELDS`."""
    tags = garment.tags
    return {
        "owner": garment.owner,
        "id": garment.id,
        "source": garment.source.value,
        "category": tags.category.value,
        "color_family": tags.color_family.value,
        "pattern": tags.pattern.value,
        "warmth": tags.warmth,
        "waterproof": tags.waterproof,
        "formality": tags.formality,
        "description": tags.description,
        "price": garment.price,
        "wears": garment.wears,
        "image_ref": garment.image_ref,
        "source_url": garment.source_url,
        "created_at": garment.created_at,
    }


def unflatten(row: Mapping[str, Any]) -> Garment:
    """Rebuild a `Garment` from one row keyed by `FIELDS`."""
    return Garment(
        id=row["id"],
        owner=row["owner"],
        source=row["source"],
        tags=GarmentTags(
            category=row["category"],
            color_family=row["color_family"],
            pattern=row["pattern"],
            warmth=row["warmth"],
            waterproof=row["waterproof"],
            formality=row["formality"],
            description=row["description"],
        ),
        price=row["price"],
        wears=row["wears"],
        image_ref=row["image_ref"],
        source_url=row["source_url"],
        # Databases answer in the session's zone; normalise so every store hands back UTC
        created_at=utc(row["created_at"]),
    )


def utc(moment: datetime) -> datetime:
    """Return `moment` in UTC; a naive time is read as UTC, never as this machine's zone."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)
