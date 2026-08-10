# Pi Web — 个人桌面版

[English](./README.md)

本项目是 [pi-web](https://github.com/agegr/pi-web) 的个人修改版 —— [pi 编程智能体](https://github.com/badlogic/pi-mono) 的本地网页界面，重新打包为 Windows 桌面应用。它会读取本机的 pi 会话文件，提供会话浏览、实时对话、模型配置、技能/插件管理、Git worktree 切换和项目文件预览。

![Pi Web 与 CLI 并排展示同一个 pi 会话：结构化的 Markdown、工具调用和项目导航](./docs/screenshot2.png)

## 快速开始（桌面应用 —— 推荐）

从 [GitHub Releases](https://github.com/yejion/pi-web-personal-use/releases) 下载最新构建：

- **`Pi-Web-Setup-*.exe`** —— 安装程序（推荐，自动创建桌面快捷方式）
- **`Pi-Web-Setup-*-portable.exe`** —— 便携版（免安装，双击即用）

桌面版自带运行时，**无需安装 Node.js**。它会在本机启动 Pi Web 服务（`127.0.0.1:30141`）并在桌面窗口中打开工作区。

## 从源码运行

需要 Node.js **22.19.0 或更高版本**（可用 `node --version` 检查）。

```bash
npm install
npm run build
npm start          # 服务运行在 http://127.0.0.1:30141
```

也可以从源码启动桌面窗口（需要先执行 `npm run build`）：

```bash
npm run desktop
```

开发时请用 `npm run dev` 而不是构建，见下文 [开发](#开发)。

**命令行参数**（通过 `npm start` / `pi-web` 启动器运行时）：

```bash
pi-web --port 8080              # 自定义端口
pi-web --hostname 0.0.0.0       # 在可信网络中开放访问
pi-web -p 8080 -H 0.0.0.0       # 组合使用
pi-web --no-open                # 不自动打开浏览器

PORT=8080 pi-web                # 也支持环境变量
PI_WEB_HOSTNAME=0.0.0.0 pi-web  # 显式开放网络访问
PI_WEB_NO_OPEN=1 pi-web         # 适用于后台服务或开机自启
```

> [!WARNING]
> Pi Web 没有应用层身份验证，并且可以调用高权限智能体。请勿将其暴露到互联网；仅在可信网络中使用非 loopback 监听地址。

## HTTP 代理

Pi Web 的服务端模型请求和 API 请求会读取标准的 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY` 环境变量。

macOS 或 Linux：

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1 \
npm start
```

Windows PowerShell：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1"
npm start
```

## 功能介绍

- **把历史工作接回来**：打开网页就能按项目找到以前的 pi 对话，不必在终端里翻文件或记住会话路径。
- **放心试不同方向**：可以从某条历史消息继续（会话内分支），也可以 fork 出一条独立的新路线，探索方案时不怕弄乱原来的对话。
- **跨分支工作**：在侧边栏切换 Git worktree，让新会话和 Explorer 跟随你选择的 checkout。
- **边聊边看项目文件**：左侧浏览项目文件，右侧打开源码、diff、文档、图片、音频、PDF 和 DOCX；文件变化会自动刷新，适合边让 agent 改边检查结果。
- **Git 集成**：直接查看项目工作区状态，并在界面里查看单个文件的 diff。
- **快速引用文件**：项目级模糊文件搜索（git 感知、遵循 `.gitignore`），方便快速把文件指给 agent。
- **底部状态栏**：输入框下方实时显示会话花费（按模型定价计算）和上下文使用量（xx.xk/总窗口），运行时自动更新，空闲后持久化保存。
- **随时掌握会话状态**：在顶部就能看到上下文占用、花费、压缩结果和系统提示，长会话不再像黑箱。
- **少离开当前界面**：模型、登录/API key、模型测试、插件和技能开关都能在网页里处理，配置 agent 时不用在多个工具之间来回切换。
- **富文本渲染**：Markdown（GFM）、KaTeX 公式、Mermaid 图表、代码高亮；任何会话都可以导出为独立的 HTML 文件。

## 注意事项

- **数据目录**：默认读取 `~/.pi/agent/sessions` 下的会话文件。可通过环境变量 `PI_CODING_AGENT_DIR` 指定其他 pi agent 目录。
- **会话文件**：路径形如 `~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl`。
- **模型配置**：Models 面板读写 pi agent 目录下的 `models.json`，模型列表和默认模型由 pi 的配置解析得到。
- **文件访问**：文件浏览和预览面向当前选择的项目目录，以及会话中已出现过的工作目录。
- **Git worktree**：什么时候显示切换器、新建目录在哪里、删除会影响什么，见 [Pi Web 里的 Worktree](./docs/worktrees.zh-CN.md)。
- **Fork 与会话内分支不同**：Fork 会创建新的 `.jsonl` 文件；"Edit from here" 是同一会话文件里的分支。
- **桌面版日志**：如果桌面应用启动失败，查看日志目录下的 `pi-web-server.log`（错误弹窗中会显示路径）。

## 开发

```bash
npm install
npm run dev        # http://127.0.0.1:30141
```

常用检查：

```bash
node_modules/.bin/tsc --noEmit   # 类型检查
npm run lint                     # eslint
node --test                      # 全部测试（node:test，测试文件为与源码同目录的 *.test.mjs）
node --test lib/ansi.test.mjs    # 运行单个测试文件
```

测试通过 Node 原生 type stripping 导入 `.ts`（因此要求 Node ≥ 22.19），`.tsx` 组件测试通过 `jiti` 导入。

开发时不要运行 `next build` / `npm run build`，它会写入 `.next/`，容易影响正在运行的 dev server。发布流程再执行构建。

### 桌面版构建

```bash
npm run build
npm run desktop        # 本地试运行 Electron 壳
npm run desktop:build  # 在 release/ 目录产出 Windows 安装包和便携版
```

Release 由 GitHub Actions 构建：手动触发 **Build and Release Pi Web Desktop** 工作流（`.github/workflows/build-desktop.yml`）。它会生成唯一的 `*-build.<时间戳>` 版本号、构建安装包，并自动发布 GitHub Release。

## 项目结构

```text
app/
  api/
    agent/          # 创建/驱动 AgentSession、SSE 事件流、bash 输出
    auth/           # OAuth 和 API key 管理
    cwd/            # 服务端目录浏览和工作目录校验
    default-cwd/    # 默认工作目录（~/pi-cwd-*）
    file-index/     # 项目级模糊文件索引/搜索
    files/          # 文件读取和预览（白名单保护）
    git/            # 工作区状态和单文件 diff
    home/           # 当前用户 home 目录
    models/         # 可用模型、默认模型
    models-config/  # 读写 models.json、测试模型
    plugins/        # 包插件管理
    sessions/       # 会话读取、重命名、删除、上下文、状态、导出、自动命名
    skills/         # skills 列表、搜索、安装、更新、启停
    worktrees/      # git worktree 列表/新建/删除
components/
  AppShell.tsx        # 主布局、URL 状态、标签管理
  SessionSidebar.tsx  # 项目选择、会话树、Explorer
  DirectoryPicker.tsx # 工作目录选择器（支持路径浏览、手动输入、驱动器切换）
  ChatWindow.tsx      # 消息区、SSE、拖拽、minimap
  ChatInput.tsx       # 输入栏、模型/工具/thinking/compact 控件、花费/上下文显示
  MessageView.tsx     # 消息、thinking、tool call/result 渲染
  MarkdownBody.tsx    # Markdown 渲染（GFM、KaTeX、MermaidBlock）
  ModelsConfig.tsx    # 模型和认证配置面板
  PluginsConfig.tsx   # 已安装包插件面板
  SkillsConfig.tsx    # 技能管理面板
  FileExplorer.tsx    # 文件树
  FileViewer.tsx      # 源码、diff、图片、音频、PDF、DOCX 预览
  TabBar.tsx          # 聊天 + 已打开文件标签
  BranchNavigator.tsx # 会话内分支切换器
  ChatMinimap.tsx     # 滚动 minimap
electron/
  main.js             # 桌面壳：启动 `next start` 并打开窗口
lib/
  rpc-manager.ts      # AgentSessionWrapper 生命周期和全局 registry
  session-reader.ts   # 解析 .jsonl 会话文件和分支上下文
  normalize.ts        # 规范化 toolCall 字段名
  file-access.ts      # 文件访问白名单（安全边界）
  request-security.ts # 跨源 API 请求防护（proxy.ts 使用）
  git-changes.ts      # git status/diff 工具
  file-fuzzy.ts       # 模糊文件索引/搜索
  worktree.ts         # 项目/worktree 解析和 git worktree 操作
  http-dispatcher.ts  # 服务端 fetch 的 HTTP(S) 代理配置
hooks/
  useAgentSession.ts  # 会话加载、发送命令、SSE 状态机
  useAudio.ts         # 完成提示音
  useKeyboardShortcuts.ts
  useTheme.ts         # 主题切换
bin/
  pi-web.js           # CLI 入口
  postinstall.js      # 修正 .next 构建产物中的哈希外部模块引用
proxy.ts              # Next.js 中间件，拦截 /api/* 跨源请求
instrumentation.ts    # 初始化服务端 HTTP dispatcher
```

`AGENTS.md` 是完整的开发笔记：架构图、设计陷阱（fork 语义、SSE 对账、会话文件格式）和全部 API 路由表。

## 致谢

基于 [agegr/pi-web](https://github.com/agegr/pi-web) 修改，感谢原作者。本仓库为个人使用维护，保留原作者信息与许可证（MIT），见 [LICENSE](./LICENSE)。
