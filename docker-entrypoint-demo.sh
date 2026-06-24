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

# 如果设置了跳过初始化，创建预配置数据库
if [ "${SKIP_INSTALL}" = "true" ]; then
    echo "检测到 SKIP_INSTALL=true，准备自动初始化..."
    
    # 检查数据库是否已存在
    if [ ! -f "${DATABASE_PATH}" ]; then
        echo "数据库不存在，开始自动初始化..."
        
        # 创建临时初始化脚本
        cat > /tmp/init_demo.json << EOF
{
  "databaseType": "sqlite",
  "databasePath": "${DATABASE_PATH}",
  "siteName": "${SITE_NAME}",
  "adminName": "${ADMIN_USERNAME}",
  "adminEmail": "${ADMIN_EMAIL}",
  "adminPassword": "${ADMIN_PASSWORD}"
}
EOF
        
        echo "初始化配置已准备完成"
        echo "注意: 实际初始化将由应用程序在首次启动时自动完成"
    else
        echo "数据库已存在，跳过初始化"
    fi
else
    echo "SKIP_INSTALL=false，将进入正常安装流程"
fi

# 设置演示站环境标识
export DEMO_MODE=true

echo ""
echo "========================================="
echo "启动 SkyImage 演示站服务..."
echo "========================================="
echo ""

# 启动应用
exec ./api