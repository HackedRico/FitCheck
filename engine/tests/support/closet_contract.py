from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from typing import NamedTuple
from uuid import uuid4

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
# the `store` fixture to yield an empty store; the base class never cleans up. A store
# that shares a table with real closets also overrides `owners` with `unique_owners()`
# and forgets those owners afterwards, so a run never touches the demo closet.


class Owners(NamedTuple):
    """The three closet owners a contract test writes under or asks about."""

    maya: str
    sam: str
    nobody: str


def unique_owners() -> Owners:
    """Return owners under a fresh `test-<uuid>-` prefix that no real closet uses."""
    prefix = f"test-{uuid4().hex}-"
    return Owners(*(prefix + name for name in Owners._fields))


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

    @pytest.fixture
    def owners(self) -> Owners:
        """Return plain owner names; a store on shared data overrides this."""
        return Owners("maya", "sam", "nobody")

    # -----------------------------------------------------------------
    # info
    # -----------------------------------------------------------------

    def test_info_names_the_adapter(self, store: ClosetStore) -> None:
        assert isinstance(store.info, AdapterInfo)
        assert store.info.name

    # -----------------------------------------------------------------
    # garments and get
    # -----------------------------------------------------------------

    def test_empty_store_has_no_garments(self, store: ClosetStore, owners: Owners) -> None:
        assert store.garments(owners.maya) == []
        assert store.get(owners.maya, "tee") is None

    def test_garments_come_back_oldest_first(self, store: ClosetStore, owners: Owners) -> None:
        # Saved out of order, so a store that returns insertion order fails
        for garment_id, minute in [("b", 20), ("c", 30), ("a", 10)]:
            store.save(make_garment(garment_id, owners.maya, minute=minute))

        assert _ids(store.garments(owners.maya)) == ["a", "b", "c"]

    def test_garments_are_scoped_per_owner(self, store: ClosetStore, owners: Owners) -> None:
        store.save(make_garment("tee", owners.maya))
        store.save(make_garment("coat", owners.sam, category=Category.OUTERWEAR))

        assert _ids(store.garments(owners.maya)) == ["tee"]
        assert _ids(store.garments(owners.sam)) == ["coat"]
        assert store.garments(owners.nobody) == []

    def test_get_returns_the_saved_garment(self, store: ClosetStore, owners: Owners) -> None:
        garment = make_garment("tee", owners.maya)
        store.save(garment)

        assert store.get(owners.maya, "tee") == garment

    def test_get_returns_none_for_another_owners_garment(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya))

        assert store.get(owners.sam, "tee") is None

    def test_get_returns_none_for_an_unknown_id(self, store: ClosetStore, owners: Owners) -> None:
        store.save(make_garment("tee", owners.maya))

        assert store.get(owners.maya, "nope") is None

    # -----------------------------------------------------------------
    # save
    # -----------------------------------------------------------------

    def test_save_replaces_a_garment_with_the_same_id(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya, wears=0))
        worn = make_garment(
            "tee", owners.maya, color=ColorFamily.BLACK, wears=4, image_ref="maya/tee.png"
        )
        store.save(worn)

        assert store.garments(owners.maya) == [worn]
        assert store.get(owners.maya, "tee") == worn

    def test_save_keys_by_owner_and_id(self, store: ClosetStore, owners: Owners) -> None:
        # The same id under another owner is a different garment, never an overwrite
        mine = make_garment("tee", owners.maya)
        theirs = make_garment("tee", owners.sam, color=ColorFamily.RED)
        store.save(mine)
        store.save(theirs)

        assert store.get(owners.maya, "tee") == mine
        assert store.get(owners.sam, "tee") == theirs

    def test_every_field_round_trips(self, store: ClosetStore, owners: Owners) -> None:
        garment = Garment(
            id="mac",
            owner=owners.maya,
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
            source_url="https://shop.example/p/mac",
            created_at=_T0,
        )
        store.save(garment)

        assert store.get(owners.maya, "mac") == garment

    def test_price_round_trips_as_exact_decimal(self, store: ClosetStore, owners: Owners) -> None:
        store.save(make_garment("tee", owners.maya, price=Decimal("19.99")))
        store.save(make_garment("scarf", owners.maya, minute=1, price=None))

        tee = store.get(owners.maya, "tee")
        assert tee is not None
        assert isinstance(tee.price, Decimal)
        assert str(tee.price) == "19.99"
        scarf = store.get(owners.maya, "scarf")
        assert scarf is not None
        assert scarf.price is None

    def test_created_at_round_trips_to_the_microsecond(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        # A non-UTC offset catches stores that drop the zone and read local time as UTC
        tokyo = timezone(timedelta(hours=9))
        created = datetime(2026, 3, 14, 15, 9, 26, 535897, tzinfo=tokyo)
        store.save(make_garment("tee", owners.maya, created_at=created))

        got = store.get(owners.maya, "tee")
        assert got is not None
        assert got.created_at.tzinfo is not None
        assert got.created_at == created

    # -----------------------------------------------------------------
    # search
    # -----------------------------------------------------------------

    def test_search_ranks_the_most_relevant_garment_first(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya, minute=1))
        store.save(
            make_garment(
                "breton",
                owners.maya,
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
                owners.maya,
                minute=3,
                category=Category.OUTERWEAR,
                color=ColorFamily.NAVY,
                description="wool overcoat",
            )
        )

        # The coat matches both words, the breton one, the tee none
        assert _ids(store.search(owners.maya, "navy wool"))[:2] == ["coat", "breton"]

    def test_search_returns_at_most_limit_garments(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        for n in range(10):
            store.save(make_garment(f"navy-{n}", owners.maya, minute=n, color=ColorFamily.NAVY))

        assert len(store.search(owners.maya, "navy")) == 8
        assert len(store.search(owners.maya, "navy", limit=3)) == 3

    def test_search_rejects_a_limit_below_one(self, store: ClosetStore, owners: Owners) -> None:
        with pytest.raises(InvalidInput):
            store.search(owners.maya, "navy", limit=0)

    def test_search_returns_nothing_when_nothing_matches(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya))

        assert store.search(owners.maya, "sequined ballgown") == []
        assert store.search(owners.maya, "   ") == []

    def test_search_never_returns_another_owners_garments(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya))
        store.save(
            make_garment("coat", owners.sam, color=ColorFamily.NAVY, description="wool overcoat")
        )

        assert store.search(owners.maya, "navy wool overcoat") == []
        assert _ids(store.search(owners.sam, "navy wool overcoat")) == ["coat"]

    # -----------------------------------------------------------------
    # forget
    # -----------------------------------------------------------------

    def test_forget_returns_the_count_and_empties_the_closet(
        self, store: ClosetStore, owners: Owners
    ) -> None:
        store.save(make_garment("tee", owners.maya))
        store.save(make_garment("coat", owners.maya, minute=1, category=Category.OUTERWEAR))

        assert store.forget(owners.maya) == 2
        assert store.garments(owners.maya) == []
        assert store.get(owners.maya, "tee") is None
        assert store.search(owners.maya, "cotton tee") == []

    def test_forget_leaves_other_owners_alone(self, store: ClosetStore, owners: Owners) -> None:
        store.save(make_garment("tee", owners.maya))
        theirs = make_garment("tee", owners.sam)
        store.save(theirs)

        store.forget(owners.maya)

        assert store.garments(owners.sam) == [theirs]

    def test_forget_an_unknown_owner_returns_zero(self, store: ClosetStore, owners: Owners) -> None:
        assert store.forget(owners.nobody) == 0
