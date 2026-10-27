#!/usr/bin/env bash
# 部署到深圳服务器：上传当前提交（不碰 data/），依赖变了才重装，重启服务后检查能打开
# 用法：bash tools/deploy.sh
set -euo pipefail

HOST=admin@47.107.182.81
KEY=~/.ssh/aliyun
DIR=/home/admin/clocktower
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain)" ]; then
  echo "有未提交的改动，先提交再部署" >&2
  exit 1
fi
REV=$(git rev-parse --short HEAD)

"${SSH[@]}" "cp $DIR/data/rooms.json $DIR/data/rooms.json.before-deploy 2>/dev/null || true; md5sum < $DIR/package-lock.json > /tmp/clocktower-lock.md5"

# 美术原图、文档、本地配置不上传；换行统一成 LF
git -c core.autocrlf=false archive HEAD -- . ':!art-src' ':!docs' ':!.claude' | "${SSH[@]}" "tar -x -C $DIR"

"${SSH[@]}" "cd $DIR && (md5sum < package-lock.json | cmp -s - /tmp/clocktower-lock.md5 || npm ci) \
  && sudo systemctl restart clocktower && sleep 2 && systemctl is-active clocktower \
  && curl -sf -o /dev/null http://localhost:3000/ && echo \"已部署 $REV\""
