# HTTPS and Reverse Proxy

This guide explains how to securely publish ProxPilot through HTTPS and a reverse proxy.

# Why HTTPS?

HTTPS is strongly recommended because it:

- Encrypts traffic
- Protects login credentials
- Enables Secure cookies
- Enables reliable use of the integrated browser console (noVNC)

---

# Browser Console

The integrated console uses WebSockets.

Modern browsers require a secure context for reliable operation.

Use HTTPS whenever the console is exposed to users.

In ProxPilot 1.7.0, Proxmox environments are configured as Infrastructures. Console connections therefore depend on the configuration of the affected Infrastructure and node, including its **Reachable host / IP**.

---

# Secure Cookies

For HTTPS:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

For local HTTP development only:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

When Secure cookies are enabled, login over plain HTTP will fail because browsers do not send the session cookie over an unencrypted connection.

After changing this setting, recreate or restart the containers:

```bash
docker compose up -d
```

---

# Caddy Example

```caddyfile
proxpilot.example.com {
    reverse_proxy localhost:8085
}
```

Caddy automatically handles WebSocket proxying with `reverse_proxy`.

When publicly reachable and configured with a valid DNS name, Caddy can also automatically obtain and renew TLS certificates.

---

# Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name proxpilot.example.com;

    ssl_certificate /etc/letsencrypt/live/proxpilot/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxpilot/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Adjust certificate paths and the server name to match your environment.

---

# WebSocket Support

The integrated browser console relies on WebSockets.

The reverse proxy must preserve the HTTP upgrade required for the WebSocket connection.

For Nginx this includes:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Caddy's `reverse_proxy` handles WebSocket upgrades automatically.

If ordinary ProxPilot pages work but the integrated console does not, check the reverse proxy configuration first.

---

# Proxmox Node Connectivity

The public reverse proxy does not connect directly to Proxmox VE.

The ProxPilot backend communicates with the Proxmox nodes configured under:

```text
Settings
→ Infrastructure
```

For every node, verify that its configured **Reachable host / IP** can be reached from the ProxPilot environment.

The Proxmox API normally uses:

```text
TCP 8006
```

Test connectivity from the Docker host:

```bash
nc -vz NODE-IP 8006
```

Example:

```bash
nc -vz 192.168.1.10 8006
```

If one Infrastructure or one node fails while others work, verify the configuration of that specific Infrastructure instead of changing unrelated global settings.

The former global `PVE_NODE_HOSTS` configuration is not used by the ProxPilot 1.7.0 Infrastructure model.

---

# Common Problems

## Login works locally but not via HTTPS

Verify:

- `PROXPILOT_COOKIE_SECURE`
- reverse proxy headers
- HTTPS certificate validity
- browser developer tools
- that the browser is actually accessing the HTTPS URL

For a production HTTPS deployment:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

Check the backend logs if authentication still fails:

```bash
docker compose logs --tail=200 backend
```

---

## Login fails over HTTP

This is expected when:

```dotenv
PROXPILOT_COOKIE_SECURE=true
```

Browsers do not send Secure cookies over plain HTTP.

Use HTTPS for production.

For HTTP-only development environments, use:

```dotenv
PROXPILOT_COOKIE_SECURE=false
```

---

## Console opens but stays black

Check:

- the affected Infrastructure in **Settings → Infrastructure**
- the node's **Reachable host / IP**
- WebSocket support in the reverse proxy
- connectivity from ProxPilot to TCP 8006 on the affected Proxmox node
- whether the same guest console works in the native Proxmox VE interface

Test node connectivity:

```bash
nc -vz NODE-IP 8006
```

If only one node is affected, verify that node's address instead of changing the complete Infrastructure.

---

## WebSocket 403

Verify:

- valid ProxPilot login session
- session cookie is present
- `PROXPILOT_COOKIE_SECURE` matches the deployment
- ProxPilot is accessed through HTTPS
- reverse proxy forwards WebSocket upgrades
- the user has the required ProxPilot role
- the Proxmox API token has the required console permission

For Proxmox API permissions, see:

```text
API-PERMISSIONS.md
```

---

## ProxPilot works but console connection fails for one Infrastructure

Because ProxPilot 1.7.0 stores Proxmox connection settings per Infrastructure, a connection problem can affect only one environment.

Verify for the affected Infrastructure:

- API connectivity
- API token permissions
- TLS verification setting
- node **Reachable host / IP**
- TCP 8006 connectivity

Follow the backend logs while reproducing the problem:

```bash
docker compose logs -f backend
```

---

# Let's Encrypt

Let's Encrypt certificates are suitable for publicly resolvable deployments.

Certificate renewal should be automated.

When using Caddy with a publicly resolvable hostname, certificate issuance and renewal can normally be handled automatically by Caddy.

When using Nginx with an external ACME client such as Certbot, ensure that certificate renewal also reloads Nginx when required.

For private environments without publicly resolvable DNS names, use a certificate issued by a CA trusted by the client systems or another TLS setup appropriate for the environment.

---

# Security Recommendations

- Never expose ProxPilot without authentication.
- Use HTTPS for production deployments.
- Restrict access to trusted networks where possible.
- Use trusted TLS certificates.
- Keep Docker images updated.
- Protect `.env` and the persistent `data/` directory.
- Never publish API token secrets, passwords, session secrets or SSH private keys.
- Expose only the ports that are actually required.
- Do not expose Proxmox TCP 8006 publicly solely for ProxPilot; the ProxPilot backend only needs network access to the configured Proxmox nodes.

---

# Troubleshooting Commands

Check container status:

```bash
docker compose ps
```

Check backend logs:

```bash
docker compose logs --tail=200 backend
```

Follow backend logs:

```bash
docker compose logs -f backend
```

Check the ProxPilot HTTP endpoint locally:

```bash
curl -I http://127.0.0.1:8085
```

Check connectivity to a Proxmox node:

```bash
nc -vz NODE-IP 8006
```

If the local ProxPilot endpoint works but the public HTTPS URL does not, investigate the reverse proxy or TLS configuration.

If the public interface works but only the browser console fails, investigate WebSocket handling and connectivity to the affected Proxmox node.

---

# Related Documentation

- `INSTALLATION.md`
- `CONFIGURATION.md`
- `AUTHENTICATION.md`
- `API-PERMISSIONS.md`
- `TROUBLESHOOTING.md`

---

End of document.
