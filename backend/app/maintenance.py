import asyncio
from pathlib import Path
import paramiko
from .config import get_settings
class MaintenanceError(RuntimeError): pass
def _run(node,action):
    s=get_settings(); host=s.node_hosts.get(node)
    if not host: raise MaintenanceError(f'Keine SSH-Adresse für {node}')
    if action not in {'enable','disable'}: raise MaintenanceError('Ungültige Aktion')
    if not Path(s.pve_ssh_key).is_file(): raise MaintenanceError(f'SSH-Key fehlt: {s.pve_ssh_key}')
    c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(host,port=s.pve_ssh_port,username=s.pve_ssh_user,key_filename=s.pve_ssh_key,look_for_keys=False,allow_agent=False,timeout=10)
        _,out,err=c.exec_command(f'ha-manager crm-command node-maintenance {action} {node}',timeout=30)
        code=out.channel.recv_exit_status(); so=out.read().decode().strip(); se=err.read().decode().strip()
        if code: raise MaintenanceError(se or so or f'Exit-Code {code}')
        return so or f'Maintenance {action} für {node} angefordert'
    finally: c.close()
async def set_maintenance(node,action): return await asyncio.to_thread(_run,node,action)
