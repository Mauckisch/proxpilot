import httpx
from .config import get_settings
class ProxmoxError(RuntimeError): pass
class ProxmoxClient:
    def __init__(self):
        self.s=get_settings(); self.headers={'Authorization':f'PVEAPIToken={self.s.pve_token_id}={self.s.pve_token_secret}'}
    async def request(self,method,path,data=None):
        errors=[]
        for endpoint in self.s.endpoints:
            try:
                async with httpx.AsyncClient(verify=self.s.pve_verify_ssl,timeout=20,headers=self.headers) as c:
                    r=await c.request(method,f'{endpoint}/api2/json/{path.lstrip("/")}',data=data); r.raise_for_status(); return r.json().get('data')
            except Exception as e: errors.append(f'{endpoint}: {e}')
        raise ProxmoxError('Alle Proxmox-Endpunkte fehlgeschlagen: '+' | '.join(errors))
    async def dashboard(self):
        resources=await self.request('GET','/cluster/resources') or []
        nodes=await self.request('GET','/nodes') or []
        try: ha=await self.request('GET','/cluster/ha/status/current') or []
        except ProxmoxError: ha=[]
        return {'nodes':nodes,'guests':[x for x in resources if x.get('type') in {'qemu','lxc'}],'ha':ha}
    async def guest_action(self,node,kind,vmid,action):
        allowed={'qemu':{'start','shutdown','reboot','stop','reset','suspend','resume'},'lxc':{'start','shutdown','reboot','stop','suspend','resume'}}
        if kind not in allowed or action not in allowed[kind]: raise ProxmoxError('Ungültige Aktion')
        return await self.request('POST',f'/nodes/{node}/{kind}/{vmid}/status/{action}')
