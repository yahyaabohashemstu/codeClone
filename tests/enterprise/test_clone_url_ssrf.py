"""SSRF tests for normalize_clone_url — the server-side guard in front of every
git clone / ls-remote. Previously this control had zero tests despite gating
subprocess execution against user-supplied URLs.
"""

from __future__ import annotations

import socket

import pytest

from enterprise_platform.models import EnterpriseError
from enterprise_platform.utils import normalize_clone_url


def _fake_resolver(ip: str):
    def _getaddrinfo(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
    return _getaddrinfo


class TestNormalizeCloneUrl:
    def test_rejects_non_https(self):
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("http://github.com/acme/app")
        assert exc.value.code == "clone_url_scheme_not_allowed"

    def test_rejects_embedded_credentials(self):
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://user:secret@github.com/acme/app")
        assert exc.value.code == "clone_url_embeds_credentials"

    def test_rejects_query_or_fragment(self):
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://github.com/acme/app?upload-pack=x")
        assert exc.value.code == "clone_url_invalid"

    def test_rejects_non_allowlisted_host_by_default(self, monkeypatch):
        monkeypatch.delenv("ENTERPRISE_ALLOWED_GIT_HOSTS", raising=False)
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://evil.internal.example/acme/app")
        assert exc.value.code == "clone_url_host_not_allowed"

    def test_allows_default_host_that_resolves_public(self, monkeypatch):
        monkeypatch.delenv("ENTERPRISE_ALLOWED_GIT_HOSTS", raising=False)
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("140.82.112.3"))
        assert normalize_clone_url("https://github.com/acme/app") == "https://github.com/acme/app"

    def test_rejects_allowlisted_host_pointing_at_loopback(self, monkeypatch):
        # DNS-rebinding style: an allowed host name resolving to loopback.
        monkeypatch.delenv("ENTERPRISE_ALLOWED_GIT_HOSTS", raising=False)
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("127.0.0.1"))
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://github.com/acme/app")
        assert exc.value.code == "clone_url_private_host"

    def test_star_allows_any_public_host(self, monkeypatch):
        monkeypatch.setenv("ENTERPRISE_ALLOWED_GIT_HOSTS", "*")
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("93.184.216.34"))
        assert normalize_clone_url("https://git.example.com/acme/app").startswith("https://")

    def test_star_still_rejects_cloud_metadata_ip(self, monkeypatch):
        monkeypatch.setenv("ENTERPRISE_ALLOWED_GIT_HOSTS", "*")
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("169.254.169.254"))
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://metadata.evil.example/acme/app")
        assert exc.value.code == "clone_url_private_host"

    def test_star_rejects_rfc1918_ip(self, monkeypatch):
        monkeypatch.setenv("ENTERPRISE_ALLOWED_GIT_HOSTS", "*")
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("10.0.0.5"))
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://internal.evil.example/acme/app")
        assert exc.value.code == "clone_url_private_host"

    def test_custom_allowlist_scopes_to_named_hosts(self, monkeypatch):
        monkeypatch.setenv("ENTERPRISE_ALLOWED_GIT_HOSTS", "git.corp.example")
        monkeypatch.setattr(socket, "getaddrinfo", _fake_resolver("8.8.8.8"))
        assert normalize_clone_url("https://git.corp.example/acme/app").startswith("https://")
        with pytest.raises(EnterpriseError) as exc:
            normalize_clone_url("https://github.com/acme/app")
        assert exc.value.code == "clone_url_host_not_allowed"
