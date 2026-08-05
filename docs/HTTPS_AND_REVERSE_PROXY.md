# HTTPS and Reverse Proxy

This guide explains how to securely publish ProxPilot.

# Why HTTPS?

HTTPS is strongly recommended because it:

-   Encrypts traffic
-   Protects login credentials
-   Enables Secure cookies
-   Enables the integrated browser console (noVNC)

------------------------------------------------------------------------

# Browser Console

The integrated console uses WebSockets.

Modern browsers require a secure context for reliable operation.

Use HTTPS whenever the console is exposed to users.

------------------------------------------------------------------------

# Secure Cookies

For HTTPS:

``` dotenv
PROXPILOT_COOKIE_SECURE=true
```

For local HTTP development only:

``` dotenv
PROXPILOT_COOKIE_SECURE=false
```

When Secure cookies are enabled, login over plain HTTP will fail because
browsers do not send the session cookie.

------------------------------------------------------------------------

# Caddy Example

``` caddyfile
proxpilot.example.com {
    reverse_proxy localhost:8085
}
```

Caddy automatically requests and renews Let's Encrypt certificates.

------------------------------------------------------------------------

# Nginx Example

``` nginx
server {
    listen 443 ssl http2;
    server_name proxpilot.example.com;

    ssl_certificate /etc/letsencrypt/live/proxpilot/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxpilot/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

------------------------------------------------------------------------

# WebSocket Support

Reverse proxies must forward:

-   Upgrade
-   Connection
-   Host

Otherwise the integrated console will fail to connect.

------------------------------------------------------------------------

# Common Problems

## Login works locally but not via HTTPS

Verify:

-   PROXPILOT_COOKIE_SECURE
-   Reverse proxy headers
-   Browser developer tools

## Login fails over HTTP

Expected when:

``` dotenv
PROXPILOT_COOKIE_SECURE=true
```

Use HTTPS or disable Secure cookies only for development.

## Console opens but stays black

Check:

-   Node mapping (`PVE_NODE_HOSTS`)
-   WebSocket support in the reverse proxy
-   Firewall access to TCP 8006

## WebSocket 403

Verify:

-   Valid login session
-   Session cookie present
-   Secure cookie configuration
-   HTTPS access

------------------------------------------------------------------------

# Let's Encrypt

Recommended for public deployments.

Certificates should be renewed automatically by the reverse proxy.

------------------------------------------------------------------------

# Security Recommendations

-   Never expose ProxPilot without authentication.
-   Restrict access to trusted networks where possible.
-   Use trusted TLS certificates.
-   Keep Docker images updated.

------------------------------------------------------------------------

# Related Documentation

-   INSTALLATION.md
-   CONFIGURATION.md
-   AUTHENTICATION.md
-   API-PERMISSIONS.md
-   TROUBLESHOOTING.md
