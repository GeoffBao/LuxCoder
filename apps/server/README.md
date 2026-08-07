# MyYoda Server — 企业版 Skills 分发注册中心

MyYoda 企业版的组织级 Skills 分发与协作服务端。管理员集中管理组织 Skills 仓库，一键下发到成员客户端；成员在 MyYoda 中连接组织后即可免安装使用组织 Skills，并随组织版本统一更新。

## 功能

- **账号体系**：注册 / 登录 / JWT 鉴权
- **组织管理**：创建组织（自动生成邀请码）、凭码加入、成员角色（admin / member）
- **Skills 仓库**：发布 Skill（zip）、多版本管理、撤销、列表 / 详情 / 下载
- **分发协议**：成员客户端通过 REST API 拉取组织 Skills 并复用本地 SkillImportSource 语义

## 技术栈

- **Bun** 1.2.5+（运行时与 `bun:sqlite`）
- **Hono** 4.x（Web 框架）
- **jose**（JWT）
- **fflate**（zip 打包 / 解包，纯 JS）

## 本地开发

```bash
cd apps/server
bun install        # 或仓库根目录 bun install
bun run dev        # 开发模式（watch）
bun test           # 运行测试
```

默认监听 `http://localhost:8787`。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | HTTP 端口 | `8787` |
| `MYYODA_SERVER_DB` | SQLite 数据库路径 | `data/myyoda-server.db` |
| `MYYODA_SERVER_SKILLS_DIR` | Skills 内容存储目录 | `data/skills` |
| `MYYODA_SERVER_JWT_SECRET` | JWT 签名密钥（生产必须设置强随机值） | 开发默认值 |

## Docker 部署

```bash
docker compose -f apps/server/docker-compose.yml up -d
```

或手动构建：

```bash
docker build -f apps/server/Dockerfile -t myyoda-server .
docker run -d -p 8787:8787 \
  -e MYYODA_SERVER_JWT_SECRET="$(openssl rand -hex 32)" \
  -v myyoda-server-data:/data \
  myyoda-server
```

## API 一览

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册 | 公开 |
| POST | `/api/auth/login` | 登录 → JWT | 公开 |
| POST | `/api/orgs` | 创建组织 | 登录 |
| GET | `/api/orgs/me` | 我的组织与角色 | 登录 |
| POST | `/api/orgs/join` | 凭邀请码加入 | 登录 |
| GET | `/api/orgs/:orgId/members` | 成员列表 | 组织成员 |
| PATCH | `/api/orgs/:orgId/members/:memberId` | 修改角色 | 管理员 |
| DELETE | `/api/orgs/:orgId/members/:memberId` | 移除成员 | 管理员 |
| POST | `/api/orgs/:orgId/skills` | 发布 Skill（zip） | 管理员 |
| GET | `/api/orgs/:orgId/skills` | 列出 Skills | 组织成员 |
| GET | `/api/orgs/:orgId/skills/:slug` | Skill 详情 + 版本 | 组织成员 |
| POST | `/api/orgs/:orgId/skills/:slug/versions` | 发布新版本 | 管理员 |
| GET | `/api/orgs/:orgId/skills/:slug/download` | 下载 Skill zip | 组织成员 |
| DELETE | `/api/orgs/:orgId/skills/:slug` | 撤销 Skill | 管理员 |

## Skill 包格式

上传的 Skill 是一个 zip 文件，根目录必须包含 `SKILL.md`，frontmatter 需含 `name` 与 `version`（`slug` 可选，缺省用 `name`）：

```markdown
---
name: my-skill
version: 1.0.0
description: 组织沉淀的示例 Skill
---

# My Skill

说明正文...
```

## 客户端接入

在 MyYoda「设置 → 组织 Skills」中填写服务端地址并登录。之后在「Agent 技能 → 从组织导入」中选择组织 Skill 导入当前工作区；组织管理员发布新版本后，工作区中该 Skill 会显示「有更新」，点击即可同步。
