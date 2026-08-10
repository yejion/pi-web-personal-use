# 发布流程（桌面版）

本 fork 只发布一种产物：**Windows 桌面应用**，通过 GitHub Release 分发。不发 npm 包（`package.json` 里的 `release` 脚本是从上游继承的，不适用于本仓库）。

每次发布产出：

- `Pi-Web-Setup-<version>.exe` —— NSIS 安装程序（推荐，自动创建桌面快捷方式）
- `Pi-Web-Setup-<version>-portable.exe` —— 便携版（免安装，双击即用）
- `latest.yml` / `*.blockmap` —— 更新元数据与增量更新块映射

## 版本号规则

- 基础版本号来自 `package.json` 的 `version`（如 `0.8.1`，prerelease 后缀会被去掉）。
- CI 会在末尾拼时间戳，生成唯一版本号：`<base>-build.<yyyyMMddHHmm>`（如 `0.8.1-build.202608091641`）。
- 每个构建对应一个独立的 GitHub Release，tag 为 `v<version>`。时间戳只在 CI 工作区里临时写入 `package.json`，不会提交回仓库。
- 想提升基础版本号时，在发布前本地执行并提交推送：

```bash
npm version patch --no-git-tag-version   # 或 minor / major
git add package.json package-lock.json
git commit -m "Bump version to <version>"
git push
```

## 发布步骤

### 1. 发布前检查

```bash
node_modules/.bin/tsc --noEmit
npm run lint
node --test
git status --short --branch
```

确认工作区干净、改动已推送到 `main`。

### 2. 触发构建

GitHub 仓库页面 → **Actions** → **Build and Release Pi Web Desktop** → **Run workflow**（选择 `main` 分支）。

工作流（`.github/workflows/build-desktop.yml`，windows-latest）会自动完成：

1. `npm ci`（带 `npm_config_allow_scripts=true`，确保 `postinstall` 修正 `.next` 的哈希外部模块引用）
2. 计算并写入时间戳版本号
3. `npm run build` 构建 Next.js 生产包
4. `npx electron-builder --win --x64` 打包安装程序和便携版
5. 校验打包结果（`release/win-unpacked/resources/app/electron/main.js` 存在等）
6. 上传构建产物并创建 GitHub Release（`v<version>`）

### 3. 发布后验证

```bash
gh release list --repo yejion/pi-web-personal-use
gh release view v<version> --repo yejion/pi-web-personal-use
```

建议下载安装程序实际安装一次，确认桌面应用能正常启动（内置服务器日志在应用数据目录的 `logs/pi-web-server.log`）。

## 本地构建（不发 Release）

```bash
npm run build          # 先构建 .next（Electron 启动依赖它）
npm run desktop        # 本地试运行 Electron 壳
npm run desktop:pack   # 只打包到 release/win-unpacked（不生成安装包，快速验证）
npm run desktop:build  # 完整构建：next build + electron-builder，产物在 release/
```

注意：本地构建直接使用 `package.json` 里的版本号，不会追加 CI 的时间戳后缀。

## 修改 Release 说明

工作流创建的 Release 使用固定的说明模板。需要补充内容时，事后编辑：

```bash
gh release edit v<version> --repo yejion/pi-web-personal-use --notes-file - <<'EOF'
## 更新内容

- ...

## 文件说明

- **Pi-Web-Setup-*.exe** —— 安装程序（推荐，自动创建桌面快捷方式）
- **Pi-Web-*-portable.exe** —— 便携版（免安装，双击即用）
EOF
```

写说明时以本次发布包含的提交为准（`git log --oneline v<上一个tag>..HEAD`），不要凭记忆写。

## 常见问题

- **打包后启动失败**：先看工作流的 "Verify app contents" 步骤输出；本仓库 `asar: false`，打包后的目录结构是 `release/win-unpacked/resources/app/`（含 `electron/`、`bin/`、`.next/`、`public/`）。
- **服务器起不来**：桌面版内置服务器日志在应用 `logs/pi-web-server.log`，启动失败的错误弹窗里也会显示该路径。
- **externals 找不到**：`bin/postinstall.js` 负责把 `node_modules` 里的包复制成 `.next` 构建产物引用的哈希名；CI 里已通过 `npm_config_allow_scripts=true` 保证它执行，本地若手动跳过脚本可能导致打包后启动失败。
