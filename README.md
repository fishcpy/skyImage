# SkyImage

SkyImage 是一个现代化的图床系统，采用前后端分离架构。

## 技术栈

### 后端
- **Go 1.24+** - 高性能后端语言
- **Gin** - Web 框架
- **GORM** - ORM 数据库操作
- **Viper** - 配置管理
- **JWT** - 身份认证

### 前端
- **React 18** - 用户界面框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Radix UI** - UI 组件库
- **React Router** - 路由管理
- **Zustand** - 状态管理
- **Axios** - HTTP 客户端

### 数据库支持
- SQLite
- MySQL
- PostgreSQL

## 主要功能

- 用户注册与登录
- 图片上传与管理
- 存储策略配置
- 用户组与权限管理
- 管理员后台
- 容量监控
- API 文档
- 系统安装向导
- Turnstile 验证码集成
- 邮件通知

## 项目结构

```
skyimage/
├── cmd/                    # 命令行入口
│   ├── api/               # API 服务
│   └── legacy-import/     # 数据导入工具
├── internal/              # 内部包
│   ├── admin/            # 管理员服务
│   ├── api/              # API 处理器
│   ├── config/           # 配置管理
│   ├── data/             # 数据库模型
│   ├── files/            # 文件服务
│   ├── installer/        # 安装服务
│   ├── legacy/           # 数据迁移
│   ├── mail/             # 邮件服务
│   ├── middleware/       # 中间件
│   ├── turnstile/        # 验证码服务
│   ├── users/            # 用户服务
│   └── version/          # 版本信息
├── src/                   # 前端源码
│   ├── components/       # React 组件
│   ├── features/         # 功能页面
│   ├── layouts/          # 布局组件
│   ├── lib/              # 工具库
│   └── state/            # 状态管理
└── storage/               # 存储目录
```

## 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| HTTP_ADDR | 服务监听地址 | :8080 |
| DATABASE_TYPE | 数据库类型 | sqlite |
| DATABASE_PATH | SQLite 数据库路径 | - |
| DATABASE_HOST | 数据库主机 | - |
| DATABASE_PORT | 数据库端口 | - |
| DATABASE_NAME | 数据库名称 | - |
| DATABASE_USER | 数据库用户 | - |
| DATABASE_PASSWORD | 数据库密码 | - |
| STORAGE_PATH | 文件存储路径 | storage/uploads |
| PUBLIC_BASE_URL | 公网访问地址 | http://localhost:8080 |
| JWT_SECRET | JWT 密钥 | - |
| ALLOW_REGISTRATION | 是否允许注册 | true |
| LEGACY_DSN | 旧版数据库连接串 | - |
| FRONTEND_DIST | 前端构建目录 | dist |

## Docker 镜像构建

项目使用 GitHub Actions 自动构建和推送 Docker 镜像到 Docker Hub。

### 配置 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

- `DOCKERHUB_USERNAME`: 你的 Docker Hub 用户名
- `DOCKERHUB_TOKEN`: 你的 Docker Hub 访问令牌

### 触发构建

- 推送到 `main` 或 `master` 分支会构建 `latest` 标签
- 推送 `v*` 标签会构建对应版本号的镜像（如 `v1.0.0`）
- 支持 `linux/amd64` 和 `linux/arm64` 多架构

### 手动构建

```bash
# 构建镜像
docker build -t skyimage:latest .

# 运行镜像
docker run -d -p 8080:8080 skyimage:latest
```

## 设计理念

SkyImage 提供了简洁、现代的用户界面和流畅的用户体验。主要设计特点包括：

- 响应式设计，支持多端访问
- 深色/浅色主题切换
- 直观的文件管理界面
- 完善的权限控制系统
- 高效的图片上传体验

## 致谢

[Lsky Pro](https://github.com/lsky-org/lsky-pro) 参考了Lsky Pro的布局和部分逻辑

## 许可证

本项目采用 MIT 许可证。
