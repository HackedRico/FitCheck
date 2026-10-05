from __future__ import annotations

import io
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

from fitcheck.domain import AdapterInfo, Location, TryOnRegion, TryOnRequest, TryOnResult
from fitcheck.engine import Engine, Ports

# =============================================================================
# Module Overview
# =============================================================================
# Diffusion try-on models pad the person photo into their own frame (Leffa
# returns 768x1024 with white side bands). `Engine.render` must hand back an
# image the same shape and size as the person photo, so before and after line up.


def _png(size: tuple[int, int], color: str) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="PNG")
    return out.getvalue()


class _PaddingRenderer:
    """Behaves like Leffa: fits the person into 768x1024 and pads the sides white."""

    info = AdapterInfo(name="padding-renderer")

    def render(self, request: TryOnRequest) -> TryOnResult:
        # Real renderers turn phone photos upright before painting
        person = ImageOps.exif_transpose(Image.open(io.BytesIO(request.person_image)))
        scale = 1024 / person.height
        inner = person.convert("RGB").resize((round(person.width * scale), 1024))
        frame = Image.new("RGB", (768, 1024), "white")
        frame.paste(inner, ((768 - inner.width) // 2, 0))
        out = io.BytesIO()
        frame.save(out, format="PNG")
        return TryOnResult(image_png=out.getvalue())


def _engine(tmp_path: Path) -> Engine:
    def unused(*_: object) -> object:
        raise AssertionError("not used by a render")

    ports = Ports(
        store=unused,  # type: ignore[arg-type]
        tagger=unused,  # type: ignore[arg-type]
        cutter=unused,  # type: ignore[arg-type]
        renderer=_PaddingRenderer(),
        weather=unused,  # type: ignore[arg-type]
        calendar=unused,  # type: ignore[arg-type]
        stylist=unused,  # type: ignore[arg-type]
    )
    return Engine(
        ports,
        data_dir=tmp_path,
        default_location=Location(latitude=0, longitude=0),
        today=lambda: date(2026, 10, 4),
    )


def test_render_comes_back_in_the_person_photos_shape(tmp_path: Path) -> None:
    person = _png((682, 1024), "navy")
    result = _engine(tmp_path).render(person, _png((200, 200), "yellow"), TryOnRegion.UPPER)

    image = Image.open(io.BytesIO(result.image_png)).convert("RGB")
    assert image.size == (682, 1024)
    # The white bands are gone: the left and right edges are the person photo, not padding
    assert image.getpixel((2, 512)) != (255, 255, 255)
    assert image.getpixel((679, 512)) != (255, 255, 255)


def test_render_matches_an_upright_phone_photo(tmp_path: Path) -> None:
    # Stored landscape with EXIF "rotate 90", so the owner sees a portrait photo
    exif = Image.Exif()
    exif[0x0112] = 6
    person = io.BytesIO()
    Image.new("RGB", (1024, 682), "navy").save(person, format="JPEG", exif=exif.tobytes())

    result = _engine(tmp_path).render(
        person.getvalue(), _png((200, 200), "yellow"), TryOnRegion.UPPER
    )

    with Image.open(io.BytesIO(result.image_png)) as image:
        assert image.size == (682, 1024)
