# stella/web 前端参考架构

状态：历史架构调研；MVP 决策以 [technical-design.md](./technical-design.md) 为准
分析基线：`stella` commit `92f36b29`（2026-07-17）
参考范围：同级目录 `../stella/web`

## 1. 决策结论

`gitview` 前端不使用 Svelte。本文件记录从 `stella/web` 获得的后续多页面架构参考；首个单页 MVP 已明确不引入 TanStack Router、TanStack Query、OpenAPI client 或 CossUI，基础组件使用 shadcn/ui。以下条目是扩展阶段候选，不是当前依赖清单：

- React 19 + TypeScript。
- `@tanstack/react-router` 文件路由。
- `@tanstack/react-query` 服务端状态与缓存。
- `@hey-api/openapi-ts` 生成 API client 和 TanStack Query bindings。
- CossUI 的组件纪律，底层基于 `@base-ui/react`。
- Tailwind CSS v4 + semantic design tokens。
- Vite+ 统一 dev、build、format、lint、typecheck 和 test 工具链。
- React SPA 由 Go `go:embed` 打入本地单二进制。

`agentsview` 仍然是 Go 后端、本地索引、Service、HTTP、SSE、嵌入 SPA 和桌面交付的参考；前端框架与前端工程模式由 `stella/web` 替代。

## 2. stella/web 模块地图

```text
src/app.tsx
    │
    ├── QueryClientProvider
    ├── I18nProvider
    └── RouterProvider
            │
            ▼
    generated routeTree
            │
            ├── routes/*.tsx       params / search / loader / guard
            └── routes/*.lazy.tsx  lazy page component
                         │
                         ▼
                   features/*
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       lib/queries   components/ui  layouts
            │
            ▼
    generated OpenAPI client
            │
            ▼
          Go API
```

目录职责：

| 目录 | 职责 | gitview 使用方式 |
| --- | --- | --- |
| `routes/` | 路由参数、search 校验、loader、guard | 保持薄，不写统计页面主体 |
| `features/` | 页面级 UI、hooks 和功能私有 helper | contributors、hotspots、ownership 等独立 feature |
| `components/ui/` | 基于 Base UI 的设计系统 primitives | Button、Table、Dialog、Select、Tabs 等 |
| `components/` | 跨 feature 的业务组件 | RevisionPicker、DateRangeFilter、EntityLink 等 |
| `layouts/` | 应用 shell、侧栏和内容框架 | RepositoryLayout、AnalysisLayout |
| `hooks/` | 跨功能 React hooks | media query、resizable panel 等 |
| `lib/queries/` | query options 和分页策略 | 每个分析资源有稳定 query key |
| `lib/api-client/` | OpenAPI 生成代码 | 生成文件，不手工编辑 |
| `lib/` | i18n、theme、纯类型与 utility | 禁止变成无边界大杂烩 |

## 3. TanStack Router 采用方式

### 3.1 File-based routing

使用 `@tanstack/router-plugin/vite`：

```text
src/routes/                       route source
src/routeTree.gen.ts              自动生成，不手工修改
```

每条主要路由拆成两部分：

- `route.tsx`：params、`validateSearch`、loader、guard。
- `route.lazy.tsx`：页面组件和 code splitting。

这样数据准备和页面渲染边界清晰，也能避免主 bundle 一次包含所有分析页面。

### 3.2 Router context

Router context 注入共享 `QueryClient`。loader 通过：

```text
queryClient.ensureQueryData(resourceQueryOptions(filters))
```

在导航完成前预热关键数据；页面组件再用同一 options 调用 `useQuery`，不重复定义 URL 或 cache key。

### 3.3 URL 是可导航状态的事实来源

gitview 中以下状态必须进入 route params 或 search params：

- repository id。
- revision / branch / tag。
- since、until、period 和 timezone。
- author/person、language、path 和 entity level。
- sort、direction、page token。
- baseline 与 comparison revision/window。
- 选中的 file/function entity。

状态优先级：

```text
URL params/search
    > TanStack Query cache
    > React Context
    > useState
```

`useState` 仅保存未提交表单、popover 开关、拖动宽度等临时状态。不能用 `useEffect` 把 URL 同步进本地 state，也不能直接调用 `history.pushState`。

### 3.4 初步路由草案

```text
/_app/repos/$repoId/overview
/_app/repos/$repoId/contributors
/_app/repos/$repoId/hotspots
/_app/repos/$repoId/ownership
/_app/repos/$repoId/functions/$functionId
/_app/repos/$repoId/compare
/_app/settings
```

通用筛选放 search params，避免为每个日期或分支生成路径层级。

## 4. TanStack Query 采用方式

- 每个资源在 `lib/queries/` 导出 `<resource>QueryOptions`。
- query key 包含所有影响响应的参数；遗漏任何筛选条件都可能返回错误缓存。
- 参数不足时使用 `enabled: !!requiredParam`。
- 分页使用 `infiniteQueryOptions` 与 opaque `page_token` / `next_page_token`。
- mutation 成功后按实体范围精确 invalidate，不清空全部 cache。
- 不在 feature 中散落手写 fetch 或临时 query key。
- 长耗时 analysis job 与其结果 query 分离；SSE 更新 job progress，完成后 invalidate 对应 report。

gitview 示例：

```text
contributorsQueryOptions({ repoId, revision, since, until, period, path })
hotspotsInfiniteQueryOptions({ repoId, revision, level, language, sort })
functionHistoryQueryOptions({ repoId, functionId, since, until })
```

## 5. OpenAPI 与生成客户端

参考 stella 的 spec-first 链路：

```text
Go API contract / OpenAPI
          │
          ▼
@hey-api/openapi-ts
          │
          ├── fetch SDK
          ├── TypeScript types
          └── TanStack Query bindings
```

约束：

- React 代码不手写 API DTO。
- 组件不直接写 `fetch()`。
- 生成目录不手工编辑、不参与常规 lint 修复。
- API 时间统一为带时区 RFC3339；本地化只发生在展示层。
- API pagination token 对前端不透明。
- analysis warnings、confidence 和 schema version 属于正式契约字段。

后端使用 Huma 直接生成 OpenAPI还是维护独立 spec，需要在 Spike 确认；无论来源如何，只允许一个契约事实来源。

## 6. 组件与样式策略

参考 stella 的 CossUI 纪律，而不是复制其具体视觉主题：

- primitive 优先来自共享 `components/ui/`，不在 feature 页面重复造 Button、Dialog、Select、Table。
- feature 组件只负责布局和业务组合，视觉变体在 primitive 层统一定义。
- Tailwind v4 只消费语义 token，例如 background、foreground、muted、primary、destructive、border 与 chart-1..5。
- JSX 禁止硬编码色值、palette utility、圆角和阴影。
- light/dark 由 token 文件切换，业务组件不分别维护两套样式。
- 图表颜色使用稳定语义 token，同时用文字、形状和 label 表达含义，不能只依赖颜色。
- 图标统一使用 `lucide-react`。

CossUI 的代码复用方式和许可证仍需确认。在结论前，架构承诺的是组件纪律与 Base UI 能力，不承诺直接复制 stella 的 UI 源文件。

## 7. gitview 页面结构建议

### Repository Overview

- 当前 revision、索引新鲜度与数据质量 warnings。
- 贡献趋势、活跃人数、主要语言和近期热点摘要。
- 所有卡片都能链接到带完整 URL filters 的详情页。

### Contributors

- 日期区间、period、path、language、identity mode 筛选。
- 趋势与人员表共享同一 URL search。
- 点击 person 进入贡献区域与近期维护实体下钻。

### Hotspots

- file/function level 切换。
- change frequency、complexity、ownership risk 构成项可见。
- table 支持排序、分页和 URL 可分享状态。

### Function Detail

- 当前签名、位置、复杂度、lineage confidence。
- 修改时间线、主要贡献者和相关 commit。
- rename/move 断点清晰标记，不伪装连续历史。

### Compare

- baseline 与 target 两套 revision/window 都在 URL。
- additions、deletions、churn、complexity 与 ownership 变化。
- 支持复制 URL 复现同一比较。

## 8. 构建和嵌入

参考 stella：

- Vite build 输出到 `frontend/dist/`，再复制到 `internal/web/dist/`。
- Go `embed.FS` 嵌入构建结果。
- `internal/web/fallback/` 提供受版本控制的占位页面，使 backend-only 测试与构建不依赖生成产物。
- hash asset 使用长期 immutable cache。
- `index.html` 使用 `no-cache`。
- 不存在静态文件的 SPA route 回退到 `index.html`。
- 开发模式代理 `/api` 到 Go server。
- 后端-only 测试可使用最小 fallback shell，不强制先安装 Node。

gitview 需要进一步验证 TanStack Router 在 `basePath`、嵌入资源路径和直接刷新深层路由时的行为。

## 9. 测试策略

- route search validator：纯 TypeScript 单元测试。
- query options：query key 完整性、enabled 条件、pagination。
- feature component：loading、empty、warning、partial failure、confidence。
- router integration：search param 改变必须触发正确查询和页面状态。
- Playwright：日期筛选、back/forward、复制 URL、下钻和 SSE 进度。
- embedded SPA：Go 测试静态 asset cache header、fallback 和深层 route。
- generated client drift：CI 检查 OpenAPI 重新生成后工作树无差异。

## 10. 不应照搬的部分

- Stella 的认证、管理员和多用户 route guard：gitview 默认本地单用户。
- AI chat、MDX docs、skills、goals、scheduler 等依赖。
- `@ai-sdk/react`、Mermaid、QR code 等非核心包。
- 当前 Stella 主题的具体颜色、字体和品牌表达。
- 为简单筛选表单引入复杂 form/schema 状态库。
- `latest` 依赖策略：gitview 应在实现时固定经过验证的精确版本。

## 11. 待验证问题

1. CossUI 是直接复用、独立依赖，还是仅参考其 Base UI 组合方式。
2. TanStack Router search validator 是否需要 schema library。
3. 大型贡献表使用服务端 pagination 还是虚拟滚动，或两者结合。
4. 热点图、ownership map 和趋势图采用 SVG、Canvas 还是图表库。
5. SSE analysis job 与 TanStack Query invalidation 的统一协议。
6. 前端 package manager 使用 pnpm，Vite+ 的版本如何固定。
7. Huma 生成 OpenAPI 与 `@hey-api/openapi-ts` 的 schema 兼容性。
