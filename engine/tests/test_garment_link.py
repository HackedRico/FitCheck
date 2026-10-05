from __future__ import annotations

import io
import socket
from typing import Any

import httpx
import pytest
import respx
from PIL import Image

from fitcheck import garment_link
from fitcheck.errors import InvalidInput
from fitcheck.garment_link import fetch_garment

# =============================================================================
# Module Overview
# =============================================================================
# Tests for importing a garment from a link: direct images, product pages with
# `og:image` or JSON-LD, and the guards that keep links off private networks.

PUBLIC_IP = "93.184.216.34"


@pytest.fixture(autouse=True)
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve every host to a public address unless a test says otherwise."""

    def fake_getaddrinfo(host: str, *_: Any, **__: Any) -> list[Any]:
        ip = "10.0.0.5" if host.startswith("internal") else PUBLIC_IP
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    monkeypatch.setattr(garment_link.socket, "getaddrinfo", fake_getaddrinfo)


def _mock(url: str) -> Any:
    """Mock `url` where the fetcher dials it.

    `fetch_garment` connects to the address it has already checked rather than
    resolving the name a second time, so the request arrives addressed to the IP
    with the shop's name in `Host`.
    """
    return respx.get(httpx.URL(url).copy_with(host=PUBLIC_IP))


def _jpeg(size: tuple[int, int] = (40, 60)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (240, 200, 30)).save(buffer, format="JPEG")
    return buffer.getvalue()


def _is_png(data: bytes) -> bool:
    return data.startswith(b"\x89PNG")


@respx.mock
def test_direct_image_link_comes_back_as_png() -> None:
    _mock("https://shop.example/coat.jpg").mock(
        return_value=httpx.Response(200, content=_jpeg(), headers={"content-type": "image/jpeg"})
    )
    linked = fetch_garment("https://shop.example/coat.jpg")
    assert _is_png(linked.image_png)
    assert linked.title is None


@respx.mock
def test_product_page_uses_og_image_resolved_against_the_page() -> None:
    page = (
        "<html><head><title>Ignored</title>"
        '<meta property="og:title" content="Yellow rain shell">'
        '<meta property="og:image" content="/img/shell.jpg"></head><body></body></html>'
    )
    _mock("https://shop.example/p/shell").mock(
        return_value=httpx.Response(200, text=page, headers={"content-type": "text/html"})
    )
    _mock("https://shop.example/img/shell.jpg").mock(
        return_value=httpx.Response(200, content=_jpeg(), headers={"content-type": "image/jpeg"})
    )
    linked = fetch_garment("https://shop.example/p/shell")
    assert _is_png(linked.image_png)
    assert linked.title == "Yellow rain shell"
    assert linked.source_url == "https://shop.example/p/shell"


@respx.mock
def test_json_ld_image_is_used_when_there_is_no_og_image() -> None:
    page = (
        '<script type="application/ld+json">'
        '{"@type": "Product", "name": "Navy crewneck", "image": ["https://cdn.example/n.jpg"]}'
        "</script>"
    )
    _mock("https://shop.example/p/navy").mock(
        return_value=httpx.Response(200, text=page, headers={"content-type": "text/html"})
    )
    _mock("https://cdn.example/n.jpg").mock(
        return_value=httpx.Response(200, content=_jpeg(), headers={"content-type": "image/jpeg"})
    )
    assert _is_png(fetch_garment("https://shop.example/p/navy").image_png)


@respx.mock
def test_large_images_are_shrunk() -> None:
    _mock("https://shop.example/big.jpg").mock(
        return_value=httpx.Response(
            200, content=_jpeg((4000, 3000)), headers={"content-type": "image/jpeg"}
        )
    )
    image = Image.open(io.BytesIO(fetch_garment("https://shop.example/big.jpg").image_png))
    assert max(image.size) == 1600


@respx.mock
def test_page_without_an_image_says_what_to_do() -> None:
    _mock("https://shop.example/empty").mock(
        return_value=httpx.Response(200, text="<p>hi</p>", headers={"content-type": "text/html"})
    )
    with pytest.raises(InvalidInput, match="paste the image link"):
        fetch_garment("https://shop.example/empty")


@pytest.mark.parametrize("url", ["ftp://shop.example/a.jpg", "file:///etc/passwd", "shop.example"])
def test_only_web_links_are_accepted(url: str) -> None:
    with pytest.raises(InvalidInput, match="https://"):
        fetch_garment(url)


def test_private_network_hosts_are_refused() -> None:
    with pytest.raises(InvalidInput, match="private network"):
        fetch_garment("https://internal.example/coat.jpg")


def test_ipv4_mapped_private_addresses_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """A AAAA record of `::ffff:127.0.0.1` reaches loopback on a dual-stack socket."""

    def mapped(host: str, *_: Any, **__: Any) -> list[Any]:
        return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::ffff:127.0.0.1", 0, 0, 0))]

    monkeypatch.setattr(garment_link.socket, "getaddrinfo", mapped)
    with pytest.raises(InvalidInput, match="private network"):
        fetch_garment("https://mapped.example/coat.jpg")


@respx.mock
def test_redirects_into_a_private_network_are_refused() -> None:
    _mock("https://shop.example/r").mock(
        return_value=httpx.Response(302, headers={"location": "https://internal.example/x"})
    )
    with pytest.raises(InvalidInput, match="private network"):
        fetch_garment("https://shop.example/r")


@respx.mock
def test_unreadable_image_is_an_input_error() -> None:
    _mock("https://shop.example/x.jpg").mock(
        return_value=httpx.Response(
            200, content=b"not an image", headers={"content-type": "image/jpeg"}
        )
    )
    with pytest.raises(InvalidInput, match="cannot read"):
        fetch_garment("https://shop.example/x.jpg")


@respx.mock
def test_a_host_that_turns_private_after_the_check_never_gets_connected_to() -> None:
    """DNS rebinding: the name passes the check, then resolves to a private address."""
    answers = iter([PUBLIC_IP, "127.0.0.1", "127.0.0.1"])
    last = {"ip": PUBLIC_IP}

    def rebinding(host: str, *_: Any, **__: Any) -> list[Any]:
        last["ip"] = next(answers, last["ip"])
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (last["ip"], 0))]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(garment_link.socket, "getaddrinfo", rebinding)
        # Mocked so that a connection to loopback would succeed loudly if it happened
        _mock("https://rebind.example/coat.jpg").mock(
            return_value=httpx.Response(
                200, content=_jpeg(), headers={"content-type": "image/jpeg"}
            )
        )
        respx.get(httpx.URL("https://rebind.example/coat.jpg").copy_with(host="127.0.0.1")).mock(
            return_value=httpx.Response(
                200, content=b"internal", headers={"content-type": "image/jpeg"}
            )
        )
        with pytest.raises(InvalidInput, match="private network"):
            fetch_garment("https://rebind.example/coat.jpg")
