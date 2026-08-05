from __future__ import annotations

import ssl
from dataclasses import dataclass
from typing import Literal

from ldap3 import (
    ALL,
    BASE,
    SUBTREE,
    Connection,
    Server,
    Tls,
)
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars

from .config import get_settings
from .settings_store import (
    get_bool_setting,
    get_int_setting,
    get_setting,
)


LdapRole = Literal["admin", "viewer"]


@dataclass
class LdapConfiguration:
    enabled: bool
    server: str
    port: int
    use_ssl: bool
    start_tls: bool
    verify_ssl: bool
    bind_dn: str
    bind_password: str
    base_dn: str
    user_filter: str
    admin_group_dn: str
    viewer_group_dn: str
    default_role: str


@dataclass
class LdapAuthenticatedUser:
    username: str
    distinguished_name: str
    role: LdapRole


def load_ldap_configuration() -> LdapConfiguration:
    defaults = get_settings()

    return LdapConfiguration(
        enabled=get_bool_setting(
            "ldap.enabled",
            defaults.proxpilot_ldap_enabled,
        ),
        server=(
            get_setting(
                "ldap.server",
                defaults.proxpilot_ldap_server,
            )
            or ""
        ).strip(),
        port=get_int_setting(
            "ldap.port",
            defaults.proxpilot_ldap_port,
        ),
        use_ssl=get_bool_setting(
            "ldap.use_ssl",
            defaults.proxpilot_ldap_use_ssl,
        ),
        start_tls=get_bool_setting(
            "ldap.start_tls",
            defaults.proxpilot_ldap_start_tls,
        ),
        verify_ssl=get_bool_setting(
            "ldap.verify_ssl",
            defaults.proxpilot_ldap_verify_ssl,
        ),
        bind_dn=(
            get_setting(
                "ldap.bind_dn",
                defaults.proxpilot_ldap_bind_dn,
            )
            or ""
        ).strip(),
        bind_password=(
            get_setting(
                "ldap.bind_password",
                defaults.proxpilot_ldap_bind_password,
            )
            or ""
        ),
        base_dn=(
            get_setting(
                "ldap.base_dn",
                defaults.proxpilot_ldap_base_dn,
            )
            or ""
        ).strip(),
        user_filter=(
            get_setting(
                "ldap.user_filter",
                defaults.proxpilot_ldap_user_filter,
            )
            or defaults.proxpilot_ldap_user_filter
        ).strip(),
        admin_group_dn=(
            get_setting(
                "ldap.admin_group_dn",
                defaults.proxpilot_ldap_admin_group_dn,
            )
            or ""
        ).strip(),
        viewer_group_dn=(
            get_setting(
                "ldap.viewer_group_dn",
                defaults.proxpilot_ldap_viewer_group_dn,
            )
            or ""
        ).strip(),
        default_role=(
            get_setting(
                "ldap.default_role",
                defaults.proxpilot_ldap_default_role,
            )
            or "viewer"
        ).strip(),
    )


def _build_server(
    configuration: LdapConfiguration,
) -> Server:
    tls = None

    if configuration.use_ssl or configuration.start_tls:
        tls = Tls(
            validate=(
                ssl.CERT_REQUIRED
                if configuration.verify_ssl
                else ssl.CERT_NONE
            ),
            version=ssl.PROTOCOL_TLS_CLIENT,
        )

    return Server(
        host=configuration.server,
        port=configuration.port,
        use_ssl=configuration.use_ssl,
        tls=tls,
        get_info=ALL,
        connect_timeout=10,
    )


def _open_connection(
    configuration: LdapConfiguration,
    *,
    user: str | None = None,
    password: str | None = None,
) -> Connection:
    connection = Connection(
        _build_server(configuration),
        user=user,
        password=password,
        auto_bind=False,
        receive_timeout=15,
        raise_exceptions=True,
    )

    connection.open()

    if configuration.start_tls:
        connection.start_tls()

    if user:
        connection.bind()

    return connection


def _validate_configuration(
    configuration: LdapConfiguration,
) -> None:
    if not configuration.server:
        raise ValueError(
            "LDAP server is not configured."
        )

    if not configuration.base_dn:
        raise ValueError(
            "LDAP base DN is not configured."
        )

    if (
        configuration.use_ssl
        and configuration.start_tls
    ):
        raise ValueError(
            "LDAPS and StartTLS cannot be enabled "
            "at the same time."
        )

    if "{username}" not in configuration.user_filter:
        raise ValueError(
            "The LDAP user filter must contain "
            "{username}."
        )


def test_ldap_configuration(
    configuration: LdapConfiguration,
) -> dict[str, object]:
    _validate_configuration(configuration)

    connection: Connection | None = None

    try:
        connection = _open_connection(
            configuration,
            user=configuration.bind_dn or None,
            password=(
                configuration.bind_password
                if configuration.bind_dn
                else None
            ),
        )

        search_ok = connection.search(
            search_base=configuration.base_dn,
            search_filter="(objectClass=*)",
            search_scope=BASE,
            attributes=["distinguishedName"],
            size_limit=1,
        )

        if not search_ok:
            raise ValueError(
                "LDAP base DN could not be queried."
            )

        return {
            "ok": True,
            "server": configuration.server,
            "port": configuration.port,
            "encrypted": (
                configuration.use_ssl
                or configuration.start_tls
            ),
            "bind_used": bool(
                configuration.bind_dn
            ),
            "base_dn": configuration.base_dn,
            "message": (
                "LDAP connection test completed "
                "successfully."
            ),
        }

    except LDAPException as exc:
        raise ValueError(
            f"LDAP connection test failed: {exc}"
        ) from exc

    finally:
        if connection is not None:
            try:
                connection.unbind()
            except LDAPException:
                pass


def test_ldap_connection() -> dict[str, object]:
    return test_ldap_configuration(
        load_ldap_configuration(),
    )


def _determine_role(
    configuration: LdapConfiguration,
    member_of: list[str],
) -> LdapRole:
    normalized_groups = {
        group.casefold()
        for group in member_of
    }

    if (
        configuration.admin_group_dn
        and configuration.admin_group_dn.casefold()
        in normalized_groups
    ):
        return "admin"

    if (
        configuration.viewer_group_dn
        and configuration.viewer_group_dn.casefold()
        in normalized_groups
    ):
        return "viewer"

    return (
        "admin"
        if configuration.default_role == "admin"
        else "viewer"
    )


def authenticate_ldap_user(
    username: str,
    password: str,
) -> LdapAuthenticatedUser | None:
    configuration = load_ldap_configuration()

    if not configuration.enabled:
        return None

    if not username.strip() or not password:
        return None

    _validate_configuration(configuration)

    search_connection: Connection | None = None
    user_connection: Connection | None = None

    try:
        search_connection = _open_connection(
            configuration,
            user=configuration.bind_dn or None,
            password=(
                configuration.bind_password
                if configuration.bind_dn
                else None
            ),
        )

        escaped_username = escape_filter_chars(
            username.strip()
        )

        search_filter = (
            configuration.user_filter.replace(
                "{username}",
                escaped_username,
            )
        )

        search_ok = search_connection.search(
            search_base=configuration.base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=[
                "distinguishedName",
                "memberOf",
                "sAMAccountName",
                "uid",
            ],
            size_limit=2,
        )

        if (
            not search_ok
            or len(search_connection.entries) != 1
        ):
            return None

        entry = search_connection.entries[0]
        user_dn = str(entry.entry_dn)

        member_of: list[str] = []

        if "memberOf" in entry:
            member_of = [
                str(value)
                for value in entry.memberOf.values
            ]

        user_connection = _open_connection(
            configuration,
            user=user_dn,
            password=password,
        )

        if not user_connection.bound:
            return None

        return LdapAuthenticatedUser(
            username=username.strip(),
            distinguished_name=user_dn,
            role=_determine_role(
                configuration,
                member_of,
            ),
        )

    except LDAPException:
        return None

    finally:
        if user_connection is not None:
            try:
                user_connection.unbind()
            except LDAPException:
                pass

        if search_connection is not None:
            try:
                search_connection.unbind()
            except LDAPException:
                pass
