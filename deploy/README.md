# Auto-deploy via GitHub webhook

This folder contains a small webhook listener that automatically rebuilds and redeploys the docs site when a push is made to the `main` branch on GitHub.

## How it works

1. GitHub sends a `push` webhook to `https://docs.yourdomain.com/webhook/docs` (or your VPS IP).
2. The VPS validates the webhook signature using a shared secret.
3. If valid and the push was to `main`, the listener runs `deploy.sh`.
4. `deploy.sh` does `git pull`, `docker compose down`, then `docker compose up -d --build`.

## Setup on the VPS

### 1. Copy files to the VPS

Make sure these files live at `/home/truckline/web_servers/docs/deploy/`:

- `webhook-server.py`
- `deploy.sh`
- `webhook.service`

### 2. Make scripts executable

```bash
chmod +x /home/truckline/web_servers/docs/deploy/deploy.sh
chmod +x /home/truckline/web_servers/docs/deploy/webhook-server.py
```

### 3. Generate a webhook secret

```bash
openssl rand -hex 32
```

Copy the output and update the `WEBHOOK_SECRET` line in `webhook.service`.

### 4. Create the log file

```bash
sudo touch /var/log/truckline-docs-deploy.log
sudo chown truckline:truckline /var/log/truckline-docs-deploy.log
```

### 5. Install and start the systemd service

```bash
sudo cp /home/truckline/web_servers/docs/deploy/webhook.service /etc/systemd/system/truckline-docs-webhook.service
sudo systemctl daemon-reload
sudo systemctl enable --now truckline-docs-webhook.service
```

Check status:

```bash
sudo systemctl status truckline-docs-webhook.service
```

### 6. Expose the webhook securely

The listener runs on port `9000` by default. You should not expose it directly to the internet without HTTPS/reverse proxy.

#### Option A: Nginx reverse proxy (recommended)

Add a server block like this:

```nginx
server {
    listen 443 ssl http2;
    server_name docs.yourdomain.com;

    # your SSL cert config here

    location /webhook/docs {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:3995;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

If you don't have a domain/cert yet, you can use [Let's Encrypt with Certbot](https://certbot.eff.org/) or a tool like [Caddy](https://caddyserver.com/) which handles HTTPS automatically.

#### Option B: Direct HTTP (not recommended)

If you only have an IP and no domain, you can point the GitHub webhook directly at `http://YOUR_VPS_IP:9000/webhook/docs`. This sends the webhook secret over plain HTTP, so only use this for testing or in a trusted network.

## Configure GitHub

1. Go to `https://github.com/TrucklineMP/docs/settings/hooks`
2. Click **Add webhook**
3. **Payload URL**: `https://docs.yourdomain.com/webhook/docs`
4. **Content type**: `application/json`
5. **Secret**: the same secret you put in `webhook.service`
6. **Which events?**: select **Just the push event**
7. Click **Add webhook**

GitHub will send a test ping. The listener ignores ping events, which is fine.

## Testing

Make a small commit and push to `main`, then check:

```bash
tail -f /var/log/truckline-docs-deploy.log
sudo journalctl -u truckline-docs-webhook.service -f
```

You should see the deploy script run and the container rebuild.

## Notes

- The listener ignores pushes to branches other than `main`.
- The deploy runs in the background so GitHub gets an immediate `200 OK` response.
- Make sure the `truckline` user is in the `docker` group so `docker compose` works without `sudo`:

```bash
sudo usermod -aG docker truckline
```

Then log out and back in, or run `newgrp docker`.
