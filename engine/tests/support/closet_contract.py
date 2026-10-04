from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from fitcheck.domain import (
    AdapterInfo,
    Category,
    ColorFamily,
    Garment,
    GarmentTags,
    Pattern,
    Source,
)
from fitcheck.errors import InvalidInput
from fitcheck.ports import ClosetStore

_T0 = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)

# =============================================================================
# Module Overview
# =============================================================================
# `ClosetStoreContract` is the behaviour every `ClosetStore` must show, written once
# against the protocol. A store's test module subclasses it as `Test...` and overrides
# the `store` fixture to yield an empty store; the base class never cleans up.


def make_garment(
    garment_id: str,
    owner: str = "maya",
    *,
    minute: int = 0,
    category: Category = Category.TOP,
    color: ColorFamily = ColorFamily.WHITE,
    pattern: Pattern = Pattern.SOLID,
    description: str = "cotton crew tee",
    **fields: object,
) -> Garment:
    """Return a garment created `minute` minutes after a fixed instant, with `fields` overriding."""
    tags = GarmentTags(
        category=category,
        color_family=color,
        pattern=pattern,
        warmth=2,
        waterproof=False,
        formality=2,
        description=description,
    )
    values: dict[str, object] = {
        "id": garment_id,
        "owner": owner,
        "tags": tags,
        "created_at": _T0 + timedelta(minutes=minute),
    }
    return Garment.model_validate(values | fields)


def _ids(garments: list[Garment]) -> list[str]:
    return [g.id for g in garments]


class ClosetStoreContract:
    """Tests every `ClosetStore` must pass; subclass as `Test...` and override `store`."""

    @pytest.fixture
    def store(self) -> ClosetStore:
        """Yield an empty store; every subclass overrides this."""
        raise NotImplementedError("Override the `store` fixture to yield an empty `ClosetStore`.")

    # -----------------------------------------------------------------
    # info
    # -----------------------------------------------------------------

    def test_info_names_the_adapter(self, store: ClosetStore) -> None:
        assert isinstance(store.info, AdapterInfo)
        assert store.info.name

    # -----------------------------------------------------------------
    # garments and get
    # -----------------------------------------------------------------

    def test_empty_store_has_no_garments(self, store: ClosetStore) -> None:
        assert store.garments("maya") == []
        assert store.get("maya", "tee") is None

    def test_garments_come_back_oldest_first(self, store: ClosetStore) -> None:
        # Saved out of order, so a store that returns insertion order fails
        for garment_id, minute in [("b", 20), ("c", 30), ("a", 10)]:
            store.save(make_garment(garment_id, minute=minute))

        assert _ids(store.garments("maya")) == ["a", "b", "c"]

    def test_garments_are_scoped_per_owner(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", "maya"))
        store.save(make_garment("coat", "sam", category=Category.OUTERWEAR))

        assert _ids(store.garments("maya")) == ["tee"]
        assert _ids(store.garments("sam")) == ["coat"]
        assert store.garments("nobody") == []

    def test_get_returns_the_saved_garment(self, store: ClosetStore) -> None:
        garment = make_garment("tee")
        store.save(garment)

        assert store.get("maya", "tee") == garment

    def test_get_returns_none_for_another_owners_garment(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", "maya"))

        assert store.get("sam", "tee") is None

    def test_get_returns_none_for_an_unknown_id(self, store: ClosetStore) -> None:
        store.save(make_garment("tee"))

        assert store.get("maya", "nope") is None

    # -----------------------------------------------------------------
    # save
    # -----------------------------------------------------------------

    def test_save_replaces_a_garment_with_the_same_id(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", wears=0))
        worn = make_garment("tee", color=ColorFamily.BLACK, wears=4, image_ref="maya/tee.png")
        store.save(worn)

        assert store.garments("maya") == [worn]
        assert store.get("maya", "tee") == worn

    def test_save_keys_by_owner_and_id(self, store: ClosetStore) -> None:
        # The same id under another owner is a different garment, never an overwrite
        mine = make_garment("tee", "maya")
        theirs = make_garment("tee", "sam", color=ColorFamily.RED)
        store.save(mine)
        store.save(theirs)

        assert store.get("maya", "tee") == mine
        assert store.get("sam", "tee") == theirs

    def test_every_field_round_trips(self, store: ClosetStore) -> None:
        garment = Garment(
            id="mac",
            owner="maya",
            source=Source.STORE,
            tags=GarmentTags(
                category=Category.OUTERWEAR,
                color_family=ColorFamily.BEIGE,
                pattern=Pattern.CHECK,
                warmth=4,
                waterproof=True,
                formality=4,
                description="belted trench coat with check lining",
            ),
            price=Decimal("189.00"),
            wears=7,
            image_ref="maya/mac.png",
            created_at=_T0,
        )
        store.save(garment)

        assert store.get("maya", "mac") == garment

    def test_price_round_trips_as_exact_decimal(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", price=Decimal("19.99")))
        store.save(make_garment("scarf", minute=1, price=None))

        tee = store.get("maya", "tee")
        assert tee is not None
        assert isinstance(tee.price, Decimal)
        assert str(tee.price) == "19.99"
        scarf = store.get("maya", "scarf")
        assert scarf is not None
        assert scarf.price is None

    def test_created_at_round_trips_to_the_microsecond(self, store: ClosetStore) -> None:
        # A non-UTC offset catches stores that drop the zone and read local time as UTC
        tokyo = timezone(timedelta(hours=9))
        created = datetime(2026, 3, 14, 15, 9, 26, 535897, tzinfo=tokyo)
        store.save(make_garment("tee", created_at=created))

        got = store.get("maya", "tee")
        assert got is not None
        assert got.created_at.tzinfo is not None
        assert got.created_at == created

    # -----------------------------------------------------------------
    # search
    # -----------------------------------------------------------------

    def test_search_ranks_the_most_relevant_garment_first(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", minute=1))
        store.save(
            make_garment(
                "breton",
                minute=2,
                category=Category.SWEATER,
                color=ColorFamily.NAVY,
                pattern=Pattern.STRIPE,
                description="breton knit",
            )
        )
        store.save(
            make_garment(
                "coat",
                minute=3,
                category=Category.OUTERWEAR,
                color=ColorFamily.NAVY,
                description="wool overcoat",
            )
        )

        # The coat matches both words, the breton one, the tee none
        assert _ids(store.search("maya", "navy wool"))[:2] == ["coat", "breton"]

    def test_search_returns_at_most_limit_garments(self, store: ClosetStore) -> None:
        for n in range(10):
            store.save(make_garment(f"navy-{n}", minute=n, color=ColorFamily.NAVY))

        assert len(store.search("maya", "navy")) == 8
        assert len(store.search("maya", "navy", limit=3)) == 3

    def test_search_rejects_a_limit_below_one(self, store: ClosetStore) -> None:
        with pytest.raises(InvalidInput):
            store.search("maya", "navy", limit=0)

    def test_search_returns_nothing_when_nothing_matches(self, store: ClosetStore) -> None:
        store.save(make_garment("tee"))

        assert store.search("maya", "sequined ballgown") == []
        assert store.search("maya", "   ") == []

    def test_search_never_returns_another_owners_garments(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", "maya"))
        store.save(make_garment("coat", "sam", color=ColorFamily.NAVY, description="wool overcoat"))

        assert store.search("maya", "navy wool overcoat") == []
        assert _ids(store.search("sam", "navy wool overcoat")) == ["coat"]

    # -----------------------------------------------------------------
    # forget
    # -----------------------------------------------------------------

    def test_forget_returns_the_count_and_empties_the_closet(self, store: ClosetStore) -> None:
        store.save(make_garment("tee"))
        store.save(make_garment("coat", minute=1, category=Category.OUTERWEAR))

        assert store.forget("maya") == 2
        assert store.garments("maya") == []
        assert store.get("maya", "tee") is None
        assert store.search("maya", "cotton tee") == []

    def test_forget_leaves_other_owners_alone(self, store: ClosetStore) -> None:
        store.save(make_garment("tee", "maya"))
        theirs = make_garment("tee", "sam")
        store.save(theirs)

        store.forget("maya")

        assert store.garments("sam") == [theirs]

    def test_forget_an_unknown_owner_returns_zero(self, store: ClosetStore) -> None:
        assert store.forget("nobody") == 0
