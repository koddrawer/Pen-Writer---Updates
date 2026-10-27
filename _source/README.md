# Pen Writer – bút máy viết tên người tặng quà cho TikTok LIVE

App Electron chạy độc lập trên Windows (không qua trình duyệt), dựng từ model `pen.blend` (bàn gỗ, bìa da, tờ giấy, bút máy).

| Cửa sổ | Dùng để |
|---|---|
| **Pen Writer - Display** (9:16) | Cảnh 3D bút viết. Thêm vào LIVE Studio bằng *Window capture* |
| **Bảng điều khiển** | Kết nối TikTok, mức donate, font, nhạc, voice, camera, cập nhật. Đóng cửa sổ này là tắt app |

## Hoạt động
- Kết nối tài khoản TikTok đang LIVE (nhập username) → nhận quà tặng của phiên live.
- Mỗi người tặng = 1 dòng, viết lần lượt từ trên xuống. Hết chỗ: tờ đã viết cong mép, trượt đi, lộ tờ trắng bên dưới.
- Mức donate theo tổng xu: mỗi mức có cỡ chữ, hoa văn, font, màu, nội dung, dòng phụ, thời gian viết, câu/file voice riêng. Mức 1 xu không có hoa văn.
- Viết xong: chữ ánh vàng kim + vệt sáng quét rồi về màu mực.
- Nhạc nền (danh sách, trộn bài, chuyển mượt) và voice cảm ơn (Google TTS / giọng Windows / file ghi âm), nhạc tự nhỏ khi đọc.

## Chạy
- Bản portable: giải nén `PenWriter-x.y.z-win-x64.zip` → chạy `Pen Writer.exe`.
- Từ mã nguồn: `npm install` rồi `npm start`.

## Cập nhật từ xa (hot update)
- Repo public `koddrawer/pen-writer-updates` chứa `app/` + `version.json` (+ `_source/` lưu mã nguồn còn lại).
- Phát hành: `npm run publish-update -- patch "ghi chú"` (repo cập nhật clone ở `../pen-writer-updates`).
- App tự kiểm tra (mặc định 30 phút/lần hoặc bấm *Kiểm tra ngay*), tải bản mới rồi hiện nút **Khởi động lại để cập nhật** – không ngắt buổi live. Bản mới lỗi khi khởi động → tự quay về bản cài sẵn.
- Không cập nhật nóng được: `shell/` và thư viện `node_modules` (tăng `minShell` + build lại bộ cài).

## Thay model 3D
```
python tools/blender/export_glb.py pen.blend app/assets        # cần: pip install bpy==5.2.*
# hoặc: blender -b --python tools/blender/export_glb.py -- pen.blend app/assets
```
Script tách `Pen` (bút) và `PenCap` (nắp), ghi toạ độ tờ giấy (`Plane`), ngòi bút, camera, đèn Sun vào `scene.json`.

## Cấu trúc
```
shell/          vỏ app: giao thức app://, chọn bản app mới nhất, bộ cập nhật GitHub
app/core/       main process: cửa sổ, TikTok, hàng chờ, TTS
app/renderer/   display (three.js: desk, sheet, writer, ornaments, voice, music) + panel
app/assets/     scene.glb, scene.json, texture giấy, font
tools/          publish-update.js, blender/export_glb.py
```
