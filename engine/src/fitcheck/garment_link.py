from __future__ import annotations

import io
import ipaddress
import json
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image, UnidentifiedImageError

from fitcheck.errors import AdapterUnavailable, InvalidInput

# Shops serve product pages to browsers; a bare client user agent gets blocked more often
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)
_MAX_BYTES = 12 * 1024 * 1024
_MAX_REDIRECTS = 5
_TIMEOUT_S = 15.0
# Large enough for the tagger and try-on, small enough to keep requests quick
_MAX_SIDE = 1600

# =============================================================================
# Module Overview
# =============================================================================
# Turns a link someone pastes into a garment image: either a direct image URL or
# a product page, where the image comes from `og:image`, `twitter:image`, JSON-LD
# `image` or the first `<img>`. `fetch_garment` returns a `LinkedGarment` with the
# image re-encoded as PNG. Every hop is checked so a link cannot reach this
# machine's private network.


@dataclass(frozen=True)
class LinkedGarment:
    """A garment image fetched from a link, with the page title when there was one."""

    image_png: bytes
    source_url: str
    title: str | None


def fetch_garment(url: str) -> LinkedGarment:
    """Fetch the garment image behind `url`, from an image link or a product page."""
    _require_public_url(url)
    with httpx.Client(
        headers={"User-Agent": _USER_AGENT, "Accept": "text/html,image/*;q=0.9,*/*;q=0.5"},
        timeout=_TIMEOUT_S,
        follow_redirects=False,
        transport=_PinnedTransport(),
    ) as client:
        final_url, content_type, body = _get(client, url)
        if content_type.startswith("image/"):
            return LinkedGarment(image_png=_to_png(body), source_url=final_url, title=None)
        if "html" not in content_type:
            raise InvalidInput(f"The link is a `{content_type}` file, not a page or an image.")
        page = _parse_page(body.decode("utf-8", errors="replace"))
        image_url = page.image_url()
        if image_url is None:
            raise InvalidInput("Found no garment image on that page; paste the image link instead.")
        image_url = urljoin(final_url, image_url)
        _require_public_url(image_url)
        _, image_type, image_body = _get(client, image_url)
        if not image_type.startswith("image/"):
            raise InvalidInput("The page's image link did not return an image.")
        return LinkedGarment(
            image_png=_to_png(image_body), source_url=final_url, title=page.title()
        )


# =============================================================================
# Fetching
# =============================================================================


class _PinnedTransport(httpx.HTTPTransport):
    """Connects only to an address the private-network check already approved.

    Rewriting the target here rather than in the URL keeps the request addressed to
    the shop, so redirects and relative image links still resolve against its name.
    """

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        address = _public_addresses(str(request.url))[0]
        if address != host:
            request.headers.setdefault("Host", request.url.netloc.decode("ascii"))
            request.extensions = {**request.extensions, "sni_hostname": host}
            request.url = request.url.copy_with(host=address)
        return super().handle_request(request)


def _get(client: httpx.Client, url: str) -> tuple[str, str, bytes]:
    """GET `url`, following redirects by hand so each hop passes the private-network check."""
    for _ in range(_MAX_REDIRECTS + 1):
        try:
            with client.stream("GET", url) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise AdapterUnavailable("The link redirected nowhere.")
                    url = urljoin(url, location)
                    _require_public_url(url)
                    continue
                if response.status_code >= 400:
                    raise AdapterUnavailable(
                        f"The shop answered {response.status_code}; it may block apps. "
                        "Open the product image and paste its link instead."
                    )
                content_type = (
                    response.headers.get("content-type", "").split(";")[0].strip().lower()
                )
                return url, content_type, _read_capped(response)
        except httpx.HTTPError as exc:
            raise AdapterUnavailable(f"Could not load the link: {type(exc).__name__}.") from exc
    raise AdapterUnavailable("The link redirected too many times.")


def _read_capped(response: httpx.Response) -> bytes:
    """Read the body chunk by chunk, stopping as soon as it passes `_MAX_BYTES`."""
    chunks: list[bytes] = []
    size = 0
    for chunk in response.iter_bytes():
        size += len(chunk)
        if size > _MAX_BYTES:
            raise InvalidInput(f"The linked file is over {_MAX_BYTES // (1024 * 1024)} MB.")
        chunks.append(chunk)
    return b"".join(chunks)


def _require_public_url(url: str) -> None:
    """Reject anything but http(s) to a public address, so a link cannot probe our network."""
    _public_addresses(url)


def _public_addresses(url: str) -> list[str]:
    """Return every address `url`'s host resolves to, once they are all public."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise InvalidInput("Paste a full link starting with `https://`.")
    try:
        addresses = {str(info[4][0]) for info in socket.getaddrinfo(parts.hostname, None)}
    except socket.gaierror as exc:
        raise InvalidInput(f"Could not find `{parts.hostname}`; check the link.") from exc
    if not addresses:
        raise InvalidInput(f"Could not find `{parts.hostname}`; check the link.")
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        # Older Python releases judge `::ffff:127.0.0.1` by its IPv6 form, which looks global
        mapped = ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) else None
        if not ip.is_global or (mapped is not None and not mapped.is_global):
            raise InvalidInput("That link points at a private network address.")
    # IPv4 first: many home and venue networks resolve AAAA records but cannot route IPv6
    return sorted(addresses, key=lambda address: (":" in address, address))


def _to_png(data: bytes) -> bytes:
    """Re-encode any image Pillow reads as a PNG no larger than `_MAX_SIDE` on its long side."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Image.DecompressionBombError as exc:
        # Not an `OSError`, so it would otherwise leave the API as an unhandled 500
        raise InvalidInput("The linked image is too large to decode.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidInput("The linked image is in a format we cannot read.") from exc
    image.thumbnail((_MAX_SIDE, _MAX_SIDE))
    out = io.BytesIO()
    image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB").save(out, format="PNG")
    return out.getvalue()


# =============================================================================
# Reading a product page
# =============================================================================


def _parse_page(html: str) -> _PageParser:
    parser = _PageParser()
    parser.feed(html)
    return parser


class _PageParser(HTMLParser):
    """Collects the image and title hints a product page offers, in order of trust."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._meta: dict[str, str] = {}
        self._ld_images: list[str] = []
        self._first_img: str | None = None
        self._title_parts: list[str] = []
        self._in_title = False
        self._in_ld = False
        self._ld_buffer: list[str] = []

    def image_url(self) -> str | None:
        """Return the best garment image URL found, or `None`."""
        for key in ("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"):
            if self._meta.get(key):
                return self._meta[key]
        return self._ld_images[0] if self._ld_images else self._first_img

    def title(self) -> str | None:
        """Return the product name from `og:title` or `<title>`, or `None`."""
        title = self._meta.get("og:title") or "".join(self._title_parts).strip()
        return title[:120] or None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content") and key not in self._meta:
                self._meta[key] = a["content"]
        elif tag == "img" and self._first_img is None:
            self._first_img = a.get("src") or a.get("data-src") or None
        elif tag == "title":
            self._in_title = True
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True
            self._ld_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            self._ld_images.extend(_ld_images("".join(self._ld_buffer)))

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)
        elif self._in_ld:
            self._ld_buffer.append(data)


def _ld_images(raw: str) -> list[str]:
    """Pull `image` values out of a JSON-LD block; malformed blocks give nothing."""
    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError:
        return []
    found: list[str] = []
    stack = [data]
    while stack:
        node = stack.pop()
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            image = node.get("image")
            if isinstance(image, str):
                found.append(image)
            elif isinstance(image, list):
                found.extend(i for i in image if isinstance(i, str))
            elif isinstance(image, dict) and isinstance(image.get("url"), str):
                found.append(image["url"])
            stack.extend(v for k, v in node.items() if k != "image")
    return found
