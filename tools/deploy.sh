#!/usr/bin/env bash
# 部署到自己的服务器：上传当前提交（不碰 data/），依赖变了才重装，重启服务后检查能打开
# 用法：复制 tools/deploy.env.example 为 tools/deploy.env 填好（不会提交），然后 bash tools/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f tools/deploy.env ] && . tools/deploy.env
: "${HOST:?在 tools/deploy.env 里设置 HOST，例如 HOST=user@1.2.3.4}"
KEY=${KEY:-~/.ssh/id_ed25519}
DIR=${DIR:-$([ "${HOST%%@*}" = root ] && echo /root/clocktower || echo "/home/${HOST%%@*}/clocktower")}
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

if [ -n "$(git status --porcelain)" ]; then
  echo "有未提交的改动，先提交再部署" >&2
  exit 1
fi
REV=$(git rev-parse --short HEAD)

"${SSH[@]}" "cp $DIR/data/rooms.json $DIR/data/rooms.json.before-deploy 2>/dev/null || true; (md5sum < $DIR/package-lock.json 2>/dev/null || echo new) > /tmp/clocktower-lock.md5"

# 美术原图、文档、本地配置不上传；换行统一成 LF
git -c core.autocrlf=false archive HEAD -- . ':!art-src' ':!docs' ':!.claude' | "${SSH[@]}" "tar -x -C $DIR"

"${SSH[@]}" "cd $DIR && (md5sum < package-lock.json | cmp -s - /tmp/clocktower-lock.md5 || npm ci) \
  && sudo systemctl restart clocktower && sleep 2 && systemctl is-active clocktower \
  && curl -sf -o /dev/null http://localhost:3000/ && echo \"已部署 $REV\""
