# 第一阶段：构建前端（使用阿里云镜像加速）
FROM registry.cn-hangzhou.aliyuncs.com/library/node:22-alpine AS web-builder
WORKDIR /app

# 配置 npm 镜像源为淘宝镜像
RUN npm config set registry https://registry.npmmirror.com/

# 复制前端代码
COPY web/package*.json ./
COPY web/pnpm-lock.yaml* ./
COPY web/ ./

# 安装依赖并构建
RUN npm install -g pnpm
RUN pnpm config set registry https://registry.npmmirror.com/
RUN pnpm install --frozen-lockfile
RUN pnpm build

# 第二阶段：构建后端（使用阿里云镜像加速）
FROM registry.cn-hangzhou.aliyuncs.com/library/golang:1.23-alpine AS go-builder
WORKDIR /app

# 配置 Go 模块代理为阿里云镜像
ENV GOPROXY=https://goproxy.cn,https://mirrors.aliyun.com/goproxy/,direct

# 复制 Go 代码
COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY pkg/ ./pkg/
COPY configs/ ./configs/

# 复制前端构建产物到后端的静态资源目录
COPY --from=web-builder /app/dist /app/pkg/web/dist

# 构建服务器二进制文件
RUN go build -o tongstock-server ./cmd/server

# 第三阶段：生产镜像（使用阿里云镜像加速）
FROM registry.cn-hangzhou.aliyuncs.com/library/alpine:latest
WORKDIR /app

# 配置 Alpine 软件源为阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装 ca-certificates 用于 HTTPS 通信
RUN apk add --no-cache ca-certificates

# 复制二进制文件和配置文件
COPY --from=go-builder /app/tongstock-server ./
COPY configs/ ./configs/

# 创建数据目录（用于存储历史数据和配置）
RUN mkdir -p /app/data

# 设置卷
VOLUME ["/app/data"]

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["./tongstock-server"]
