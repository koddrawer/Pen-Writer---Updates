# Pen Writer – kho cập nhật nóng

- `app/` + `version.json`: app trên các máy live tải về (updater ở `_source/shell/updater.js`), chỉ nhận khi version lớn hơn bản đang chạy.
- `_source/`: phần còn lại (shell, tools, package.json, workflow). Ghép: copy `app/` vào `_source/` → `npm install` → `npm start`.

## Quy trình phát hành
1. Sửa code trong `app/` (cần thì `_source/`).
2. `node --check` các file core; test màn hiển thị bằng Chromium headless nếu đụng renderer.
3. Tăng version ở CẢ `app/version.json` và `version.json` gốc, notes tiếng Việt.
4. Sửa shell/thêm thư viện npm: tăng `minShell` + `package.json` version → build lại zip Windows (`npx electron-builder --win zip --x64`).
5. Commit + push `main`.
