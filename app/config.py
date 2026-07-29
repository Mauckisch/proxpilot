from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    pve_endpoints:str
    pve_token_id:str
    pve_token_secret:str
    pve_verify_ssl:bool=False
    pve_ssh_user:str='root'
    pve_ssh_key:str='/app/ssh/id_ed25519'
    pve_ssh_port:int=22
    pve_node_hosts:str
    refresh_interval:int=10
    model_config=SettingsConfigDict(env_file='.env',case_sensitive=False)
    @property
    def endpoints(self): return [x.strip().rstrip('/') for x in self.pve_endpoints.split(',') if x.strip()]
    @property
    def node_hosts(self):
        out={}
        for item in self.pve_node_hosts.split(','):
            if item.strip():
                n,h=item.split('=',1); out[n.strip()]=h.strip()
        return out
@lru_cache
def get_settings(): return Settings()
