#!/bin/sh
set -e

# 如果 JWT_SECRET 未设置，生成一个随机的
if [ -z "$JWT_SECRET" ]; then
    echo "Warning: JWT_SECRET not set, generating a random one..."
    export JWT_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
    echo "Generated JWT_SECRET (save this if you need to restart the container):"
    echo "$JWT_SECRET"
fi

# 启动应用
exec ./api
