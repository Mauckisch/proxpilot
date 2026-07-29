# Proxmox Management Dashboard v0.2

## Neue Funktionen

- Updates auf einzelnen Nodes prüfen
- Updates auf einzelnen Nodes manuell installieren
- kein automatischer Reboot nach Updates
- Host manuell neu starten
- Host manuell herunterfahren
- Bestätigung vor Update-Installation, Reboot und Shutdown
- zusätzliche Warnbestätigung beim Shutdown außerhalb des Wartungsmodus
- keine Wartungsmodus-Warnung beim Reboot
- keine verketteten oder automatisierten Wartungsabläufe
- Live-Task-Panel mit SSH-Ausgabe und Verlauf
- parallele Update-Aktionen auf mehreren Nodes werden verhindert

## Upgrade einer bestehenden v0.1-Installation

Die vorhandenen Dateien `.env` und `ssh/` behalten.

```bash
cd /home/dennigma/proxmox-dashboard
docker compose down
```

Neue Projektdateien darüberkopieren, danach:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100
```

Weboberfläche:

```text
http://IP-DES-UTIL-HOSTS:8085
```

## Ausgeführte Befehle

Update-Prüfung:

```bash
apt-get update
apt list --upgradable
```

Update-Installation:

```bash
apt-get update
apt-get -y -o Dpkg::Options::=--force-confold full-upgrade
```

Reboot und Shutdown werden zeitversetzt über `systemctl reboot` beziehungsweise `systemctl poweroff` ausgelöst.
