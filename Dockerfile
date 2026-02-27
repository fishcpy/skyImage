# 多阶段构建 Dockerfile

# 阶段 1: 构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制前端依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装 pnpm 并安装依赖
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 复制前端源码
COPY src ./src
COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.node.json ./
COPY tailwind.config.ts postcss.config.js components.json ./

# 构建前端
RUN pnpm build

# 阶段 2: 构建后端
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache gcc musl-dev sqlite-dev

# 复制 Go 依赖文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制后端源码
COPY cmd ./cmd
COPY internal ./internal
COPY check_url.go ./

# 构建后端
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o api cmd/api/main.go

# 阶段 3: 最终镜像
FROM alpine:latest

WORKDIR /app

# 安装运行时依赖
RUN apk --no-cache add ca-certificates tzdata sqlite-libs

# 从构建阶段复制文件
COPY --from=backend-builder /app/api .
COPY --from=frontend-builder /app/dist ./dist

# 复制启动脚本
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# 复制配置文件示例
COPY .env.example .env.example

# 创建存储目录
RUN mkdir -p storage/uploads storage/data

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV HTTP_ADDR=:8080 \
    STORAGE_PATH=storage/uploads \
    FRONTEND_DIST=dist \
    DATABASE_TYPE=sqlite \
    DATABASE_PATH=storage/data/skyimage.db \
    ALLOW_REGISTRATION=true \
    TZ=Asia/Shanghai

# 注意: JWT_SECRET 必须在运行时通过环境变量设置
# 示例: docker run -e JWT_SECRET=your-secret-key ...

# 启动应用
CMD ["./docker-entrypoint.sh"]
