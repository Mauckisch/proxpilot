from functools import lru_cache

from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    pve_endpoints: str
    pve_token_id: str
    pve_token_secret: str
    pve_verify_ssl: bool = False
    pve_ssh_user: str = 'root'
    pve_ssh_key: str = '/app/ssh/id_ed25519'
    pve_ssh_port: int = 22
    pve_node_hosts: str
    refresh_interval: int = 10

    proxpilot_auth_enabled: bool = True
    proxpilot_auth_username: str = 'admin'
    proxpilot_auth_password: str = ''
    proxpilot_session_secret: str = ''
    proxpilot_cookie_secure: bool = False
    proxpilot_session_max_age: int = 43200

    proxpilot_ldap_enabled: bool = False
    proxpilot_ldap_server: str = ''
    proxpilot_ldap_port: int = 389
    proxpilot_ldap_use_ssl: bool = False
    proxpilot_ldap_start_tls: bool = False
    proxpilot_ldap_verify_ssl: bool = True
    proxpilot_ldap_bind_dn: str = ''
    proxpilot_ldap_bind_password: str = ''
    proxpilot_ldap_base_dn: str = ''
    proxpilot_ldap_user_filter: str = (
        '(&(objectClass=user)(sAMAccountName={username}))'
    )
    proxpilot_ldap_admin_group_dn: str = ''
    proxpilot_ldap_viewer_group_dn: str = ''
    proxpilot_ldap_default_role: str = 'viewer'

    model_config = SettingsConfigDict(
        env_file='.env',
        case_sensitive=False,
    )

    @property
    def endpoints(self) -> list[str]:
        return [
            endpoint.strip().rstrip('/')
            for endpoint in self.pve_endpoints.split(',')
            if endpoint.strip()
        ]

    @property
    def node_hosts(self) -> dict[str, str]:
        result: dict[str, str] = {}

        for item in self.pve_node_hosts.split(','):
            if not item.strip():
                continue

            node, host = item.split('=', 1)
            result[node.strip()] = host.strip()

        return result


@lru_cache
def get_settings() -> Settings:
    return Settings()
