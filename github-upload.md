# 将 Leaf Mark 1.10.3 上传 GitHub

## 准备文件

解压 `leaf-mark-github-v1.10.3.zip`，进入其中的 `leaf-mark` 文件夹。这个文件夹应直接包含 `README.md`、`extension/`、`tests/`、`docs/` 和 `.github/`。

源码包已排除本机测试配置、旧安装包、私人记忆记录和 Git 历史。上传时使用这个干净文件夹，不要从日常工作目录选中全部文件。

推荐仓库名称：`leaf-mark`。描述可填写：

> Chrome 书签管理与全网搜索插件：浅色玻璃界面、本地分类、顺滑拖动排序、白色图标适配和动态助手。

## 网页上传

1. 登录 GitHub，新建仓库，选择公开或私有。已有仓库可直接进入仓库首页。
2. 新建空仓库时，不勾选自动生成 README、`.gitignore` 或许可证；源码包已有前两项，许可证尚未指定。
3. 空仓库点击 **uploading an existing file**；已有仓库点击 **Add file → Upload files**。
4. 上传 `leaf-mark` 文件夹里面的内容，包括 `.github/`、`docs/`、`extension/`、`tests/` 和根目录文件。
5. 仓库根目录应直接显示 `README.md`、`extension/` 等，不要额外套一层 `leaf-mark/`，也不要把源码 ZIP 当作源码上传。
6. 填写提交说明并提交；确认 README 图片显示正常，并在 **Actions** 中查看测试结果。`.github/workflows/test.yml` 必须上传，才会出现自动检查。

网页上传不会根据本地 `.gitignore` 自动过滤文件。不要上传 `work/`、`outputs/`、`.git/`、`MEMORY.md`、浏览器配置、扩展私钥或含个人书签的数据。

## Git 上传

在解压后的 `leaf-mark` 文件夹中打开终端。若此目录尚未初始化 Git，先执行：

```sh
git init -b main
```

已有 Git 仓库无需重复初始化。添加指定的公开文件，并检查待上传内容：

```sh
git add .github docs extension tests .gitignore README.md CHANGELOG.md DESIGN.md PRODUCT.md PRIVACY.md
git status --short
git diff --cached --stat
git diff --cached --check
```

检查完成后提交：

```sh
git commit -m "Prepare Leaf Mark 1.10.3 source"
```

如果要推送到自己新建的空仓库，且本地尚未配置 origin：

```sh
git remote add origin https://github.com/YOUR_USERNAME/leaf-mark.git
git push -u origin main
```

将 `YOUR_USERNAME` 替换成自己的账号。已有仓库先用 `git remote -v` 和 `git branch --show-current` 核对远程地址及当前分支；不要重复添加 origin，也不要强制推送。

## 上传后

- 在仓库根目录阅读 README，检查图片及本地文档链接。
- 在 **Actions** 查看测试是否成功。本地通过不代表云端工作流已经执行。
- 下载源码后，按 README 加载 `extension/` 文件夹即可使用，不需要运行 npm install 或构建。
- 许可证尚未指定，源码包不包含项目 LICENSE；字体附带自身的 OFL 许可证。公开仓库不等于已授予开源使用许可。

本次整理只生成上传材料，不创建仓库、不推送、不发布 Release 或 Chrome 商店版本。
