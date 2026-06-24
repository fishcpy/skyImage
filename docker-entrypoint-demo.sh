#!/bin/sh
set -e

# 演示站专用启动脚本
# 功能：
# 1. 自动初始化演示站（如果 SKIP_INSTALL=true）
# 2. 禁止添加持久化存储策略
# 3. 强制使用 SQLite 数据库
# 4. 设置演示站限制

echo "========================================="
echo "SkyImage 演示站启动"
echo "========================================="
echo ""

# 显示演示站配置信息
echo "演示站配置信息:"
echo "- 站点名称: ${SITE_NAME}"
echo "- 管理员用户: ${ADMIN_USERNAME}"
echo "- 管理员邮箱: ${ADMIN_EMAIL}"
echo "- 数据库类型: SQLite (${DATABASE_PATH})"
echo "- 跳过初始化: ${SKIP_INSTALL}"
echo "- 演示站模式: ${DEMO_MODE}"
echo ""

# 显示演示站限制
echo "演示站限制说明:"
echo "- ⚠️  禁止添加持久化存储策略"
echo "- ⚠️  所有数据仅保存在容器内，重启后将丢失"
echo "- ⚠️  禁止注册新用户"
echo "- ⚠️  禁止创建 API Token"
echo "- ⚠️  上传的图片强制设置为私有"
echo "- ⚠️  私有图片需要登录才能查看"
echo "- ⚠️  文件大小限制: ${MAX_FILE_SIZE} bytes"
echo "- ⚠️  存储容量限制: ${MAX_CAPACITY} bytes"
echo ""

# 确保数据库目录存在
if [ ! -d "$(dirname ${DATABASE_PATH})" ]; then
    mkdir -p "$(dirname ${DATABASE_PATH})"
    echo "创建数据库目录: $(dirname ${DATABASE_PATH})"
fi

# 确保存储目录存在
if [ ! -d "${STORAGE_PATH}" ]; then
    mkdir -p "${STORAGE_PATH}"
    echo "创建存储目录: ${STORAGE_PATH}"
fi

# 设置演示站环境标识（确保环境变量正确传递）
export DEMO_MODE=true
export SKIP_INSTALL=${SKIP_INSTALL}
export SITE_NAME=${SITE_NAME}
export ADMIN_USERNAME=${ADMIN_USERNAME}
export ADMIN_EMAIL=${ADMIN_EMAIL}
export ADMIN_PASSWORD=${ADMIN_PASSWORD}
export DATABASE_TYPE=sqlite
export DATABASE_PATH=${DATABASE_PATH}

echo ""
echo "========================================="
echo "启动 SkyImage 演示站服务..."
echo "========================================="
echo ""

# 启动应用
exec ./api