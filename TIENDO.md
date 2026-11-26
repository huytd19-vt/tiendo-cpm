# TIẾN ĐỘ XÂY DỰNG — Tiến độ CPM (bản riêng, không 4D)

> Lượt sau: đọc file này trước, KHÔNG làm lại từ đầu. Chi tiết tính năng/schema: `README.md`.

## Kiến trúc đã chốt
- Web tĩnh, **không build, không server**: mở `index.html` (file://) là chạy. Script cổ điển (không ES module) để chạy qua file://.
- `vendor/xlsx.full.min.js` = SheetJS CE 0.20.3 (Apache-2.0).
- `js/cpm.js`, `js/nhap.js` dạng UMD → test được trong Node. `js/model.js`, `gantt.js`, `inan.js`, `app.js` chỉ chạy trình duyệt.
- Liên kết lưu theo `id` (không theo STT) → đổi thứ tự dòng không hỏng liên kết; STT chỉ là cách hiển thị/nhập.
- Kiểm: `npm test` (12 test lõi + nhập) · `npm run kiem` (Chrome headless, 25+ kiểm, ảnh ra `tam/tiendo_cpm_kiem/`).

## Đã xong (lượt 1 — 26/11/2026)
- [x] Lõi CPM `js/cpm.js`: lịch 5/6/7 ngày + ngày lễ, cú pháp `<STT>[FS|SS|FF|SF][+|-lag]` đa tiền nhiệm, forward/backward pass, TF/FF, ràng buộc 6 loại, hạn hoàn thành, vòng lặp, hạng mục gộp. Bãi Xép: 205 ngày, 7 găng, A1 +5, A2 0, A3 +2, M1-P1-NGAM +41 — **KHỚP** (test + giao diện).
- [x] Bảng việc đủ cột (STT, WBS tự sinh, Mã, Tên, Loại, TL quy đổi 2t/1th, BĐ/KT, LK, Dự trữ, Ràng buộc, Nguồn lực, %HT, %KH, Chậm, Lệch BL, Ghi chú); thêm/xoá/chuyển/thụt lề/liên kết nhanh/hoàn tác; thu gọn hạng mục; phím tắt.
- [x] Gantt SVG Ngày/Tuần/Tháng, găng đỏ, mốc ◆, hạng mục, 4 loại mũi tên, baseline ghost, đuôi dự trữ, ngày báo cáo, ngày nghỉ.
- [x] Lọc Tất cả/Tuần này/Chậm/Đường găng + tìm.
- [x] Nhập Excel: dán TSV + file .xlsx, đoán tiêu đề/vai trò cột, ghép cột tay, tiền nhiệm theo STT hoặc theo mã + nhiều cột Tiền nhiệm/Lag, bỏ dòng tổng cuối bảng, xem trước + chọn dòng.
- [x] Lưu/mở `.tiendo.json`, tự lưu localStorage, tự sao lưu 20 bản (Mở/Nhập thay thế/Mới/Khôi phục), Xuất Excel.
- [x] In A3/A4 ngang nhiều trang (đã kiểm PDF qua Chrome).
- [x] Baseline + % theo ngày báo cáo (progressLog) + Lệch BL + Chậm (ngày).
- [x] (Thêm) Biểu đồ nguồn lực theo mã + giới hạn/ngày + cảnh báo vượt.
- [x] File mẫu `baixep/ketqua/TienDo_BaiXep_HM15_16_20261126.tiendo.json` (khởi công 04/01/2027, lịch 7 ngày → HT 27/07/2027).

## Còn lại / ý tưởng lượt sau
- [ ] Nhập MS Project XML (.xml) — chưa làm.
- [ ] Kéo thả thanh Gantt đổi ngày/thời lượng; kéo nối liên kết trên Gantt.
- [ ] In: vẽ liên kết vượt trang; tuỳ chọn cột in.
- [ ] Đường cong S (kế hoạch vs thực tế) từ progressLog.
- [ ] Nhập sheet gốc `TienDo_BaiXep_..._20261107.xlsx` trực tiếp: cột Thời lượng là công thức chưa có giá trị lưu (file do script tạo, chưa mở Excel lưu lại) → SheetJS đọc rỗng → tạm 1 ngày. Cách xử lý: mở file bằng Excel, Lưu, rồi nhập; hoặc dùng bản `_CPM.xlsx`.
- [ ] Deploy (GitHub Pages/Vercel) — CHỜ anh Huy duyệt repo riêng.
