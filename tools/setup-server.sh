#!/usr/bin/env bash
# 新服务器一次性搭建：装 Node 和 Caddy，配好 systemd 服务和 HTTPS，然后部署当前提交
# 适用于任何带 systemd 的 Linux（x86_64 / arm64），登录用户要能免密 sudo
# 用法：在 tools/deploy.env 里填好 HOST / KEY / DIR / DOMAIN，然后 bash tools/setup-server.sh
# 之后更新代码照常 bash tools/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f tools/deploy.env ] && . tools/deploy.env
: "${HOST:?在 tools/deploy.env 里设置 HOST，例如 HOST=root@1.2.3.4}"
: "${DOMAIN:?在 tools/deploy.env 里设置 DOMAIN，例如 DOMAIN=example.com}"
KEY=${KEY:-~/.ssh/id_ed25519}
USER_=${HOST%%@*}
DIR=${DIR:-$([ "$USER_" = root ] && echo /root/clocktower || echo "/home/$USER_/clocktower")}

ssh -i "$KEY" -o BatchMode=yes "$HOST" "DOMAIN='$DOMAIN' DIR='$DIR' APPUSER='$USER_' bash -s" <<'REMOTE'
set -euo pipefail
S=$([ "$(id -u)" = 0 ] && echo "" || echo sudo)
ARCH=$(uname -m); case $ARCH in x86_64) N=x64 C=amd64;; aarch64) N=arm64 C=arm64;; *) echo "不支持的架构 $ARCH" >&2; exit 1;; esac

# Node 22：官方二进制装到 /usr/local
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  V=$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v22[^"]*"' | head -1 | cut -d'"' -f4)
  curl -fsSL "https://nodejs.org/dist/$V/node-$V-linux-$N.tar.xz" | $S tar -xJ -C /usr/local --strip-components=1
fi
NODE=$(command -v node)

# Caddy：单文件，自动申请和续期 HTTPS 证书
if ! command -v caddy >/dev/null; then
  $S curl -fsSL -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=$C"
  $S chmod +x /usr/local/bin/caddy
fi
$S mkdir -p /etc/caddy "$DIR"
$S chown "$APPUSER" "$DIR"
printf '%s, www.%s {\n\treverse_proxy localhost:3000\n}\n' "$DOMAIN" "$DOMAIN" | $S tee /etc/caddy/Caddyfile >/dev/null

$S tee /etc/systemd/system/clocktower.service >/dev/null <<EOF
[Unit]
Description=Blood on the Clocktower online grimoire
After=network.target

[Service]
User=$APPUSER
WorkingDirectory=$DIR
Environment=PORT=3000
ExecStart=$NODE server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

$S tee /etc/systemd/system/caddy.service >/dev/null <<'EOF'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
DynamicUser=yes
StateDirectory=caddy
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=always

[Install]
WantedBy=multi-user.target
EOF

$S systemctl daemon-reload
$S systemctl enable clocktower caddy >/dev/null 2>&1
$S systemctl restart caddy
echo "服务器就绪：node $(node -v)，$(caddy version | cut -d' ' -f1)"
REMOTE

# 部署代码（会启动 clocktower 服务）
bash tools/deploy.sh
echo "完成。确认云服务器防火墙放行 80 / 443，域名解析到这台机器后打开 https://$DOMAIN"
