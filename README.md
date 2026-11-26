# Tiến độ CPM — bản riêng (không 4D)

Web app lập và theo dõi tiến độ CPM/Gantt. **Chạy hoàn toàn trên máy**: mở `index.html` bằng Chrome/Edge (bấm đúp) là dùng, không cần cài đặt, không cần mạng, không gửi dữ liệu đi đâu. Dữ liệu nằm trong trình duyệt (tự lưu) và trong file `.tiendo.json` anh tự lưu.

## Dùng nhanh
1. Mở `index.html`. Bấm **⚙ Dự án**: ngày khởi công, tuần làm việc 5/6/7 ngày, ngày nghỉ lễ, hạn hoàn thành.
2. Nhập việc: gõ thẳng vào bảng, hoặc **Nhập Excel** (chọn file .xlsx hoặc copy bảng trong Excel rồi Ctrl+V) → chọn vai trò cho từng cột → Nhập.
3. Liên kết: cột **LK tiền nhiệm** cú pháp `<STT>[FS|SS|FF|SF][+|-lag]`, nhiều tiền nhiệm ngăn bằng `;` hoặc `,` — ví dụ `8FS+3; 6`.
4. **Lưu** (Ctrl+S) ra file `.tiendo.json`; **Mở** để mở lại. **Xuất Excel** ra .xlsx (số liệu tính sẵn). **In / PDF**: A3/A4 ngang.
5. Theo dõi: đặt **Ngày báo cáo** → nhập **% HT**; **Lưu baseline** để so cột **Lệch BL**; lọc **Chậm**.

Bấm `?` trong app để xem hướng dẫn đầy đủ và phím tắt.

## Tính năng
| Nhóm | Có |
|---|---|
| Bảng việc | STT, Mã WBS tự sinh theo cấp thụt lề (1 / 1.1 / 1.1.1), Mã riêng, Tên, Loại (Hạng mục/Mốc/Việc), Thời lượng (quy đổi `2t` = 2 tuần, `1th` = 1 tháng theo tuần LV 5/6/7), Bắt đầu/Kết thúc (tự tính; nhập tay chỉ khi không có tiền nhiệm; nhập Kết thúc → tự tính thời lượng), LK tiền nhiệm đa dòng, Dự trữ, Ràng buộc (SNET/SNLT/FNET/FNLT/MSO/MFO), Nguồn lực (`NC:10; MAY:2`), % HT, % KH, Chậm (ngày), Lệch BL, Ghi chú |
| CPM | Lượt đi/lượt về, ES/EF/LS/LF, tổng dự trữ, dự trữ tự do, găng = dự trữ ≤ 0, 4 loại liên kết + lag âm/dương, ràng buộc, hạn hoàn thành (dự trữ âm), phát hiện vòng lặp, hạng mục gộp từ con |
| Gantt | Ngày/Tuần/Tháng, việc găng đỏ, việc thường xanh, hạng mục, mốc ◆, mũi tên FS/SS/FF/SF, baseline (vạch xám), đuôi dự trữ, ngày báo cáo, ngày nghỉ tô xám, thu gọn hạng mục |
| Lọc | Tất cả / Tuần này (theo ngày báo cáo) / Chậm / Đường găng + ô tìm |
| Nhập | Dán từ Excel, file .xlsx/.xls/.csv (SheetJS), đoán dòng tiêu đề + vai trò cột, ghép cột tay, tiền nhiệm theo STT **hoặc theo mã** (nhiều cột “Tiền nhiệm n” + “Lag n” như sheet tiến độ cũ), bỏ dòng tổng cuối bảng |
| Lưu | `.tiendo.json` (schema bên dưới), tự lưu trình duyệt, **tự sao lưu 20 bản** trước khi Mở/Nhập thay thế/Mới/Khôi phục, hoàn tác 80 bước |
| In | A3/A4 ngang, nhiều trang, bảng gọn + Gantt vừa khổ, chú giải, chân trang |
| Nguồn lực | Biểu đồ theo ngày cho từng mã nguồn lực, giới hạn/ngày, cảnh báo vượt |

## Cấu trúc
```
index.html          giao diện
css/app.css         kiểu màn hình;  css/print.css  kiểu trang in
js/cpm.js           LÕI: lịch làm việc, cú pháp liên kết, thuật toán CPM (chạy được trong Node)
js/model.js         dữ liệu dự án, JSON, sao lưu, hoàn tác, baseline
js/gantt.js         vẽ Gantt SVG
js/nhap.js          nhập Excel/dán (chạy được trong Node)
js/inan.js          dựng trang in
js/app.js           điều khiển giao diện
vendor/xlsx.full.min.js  SheetJS CE 0.20.3 (Apache-2.0, xem LICENSE-sheetjs.txt)
test/               unit test (node --test) + dữ liệu Bãi Xép
tools/kiem_trinhduyet.mjs  kiểm giao diện bằng Chrome headless + chụp ảnh
```
Kiểm: `npm test` (lõi CPM + nhập) · `npm run kiem` (giao diện, cần Chrome/Edge).

## Quy ước tính
- Thời lượng, lag, dự trữ: **ngày làm việc** theo lịch dự án (5/6/7 ngày/tuần + ngày lễ). Tuần 7 ngày = ngày lịch.
- Ngày làm việc số 0 = ngày làm việc đầu tiên ≥ ngày khởi công. ES = đầu ngày, EF = ES + thời lượng (cuối ngày EF−1).
- FS: ES(s) ≥ EF(p)+lag · SS: ES(s) ≥ ES(p)+lag · FF: EF(s) ≥ EF(p)+lag · SF: EF(s) ≥ ES(p)+lag.
- Lượt về: LF của việc cuối = kết thúc dự án (hoặc hạn hoàn thành nếu đặt). Dự trữ = LS − ES.
- Hạng mục không nhận liên kết (giống bản tham khảo) — liên kết vào/ra hạng mục bị bỏ qua và báo cảnh báo.
- % KH tại ngày báo cáo = số ngày LV đã qua / thời lượng (theo baseline nếu có, không thì theo kế hoạch hiện tại). Chậm (ngày) = (%KH − %HT) × thời lượng. Lệch BL = kết thúc hiện tại − kết thúc baseline (ngày LV, + là trễ).

## Định dạng file `.tiendo.json` (schema `tiendo-cpm`, version 1)
```jsonc
{
  "schema": "tiendo-cpm",        // bắt buộc (hoặc bỏ trống)
  "version": 1,
  "name": "Bãi Xép HM15-16",
  "startDate": "2027-01-04",      // ngày khởi công yyyy-mm-dd
  "workWeek": 7,                  // 5 | 6 | 7
  "holidays": ["2027-04-30"],     // ngày nghỉ thêm
  "deadline": null,               // hạn hoàn thành (tuỳ chọn)
  "statusDate": "2027-03-01",     // ngày báo cáo
  "baselineDate": "2026-11-26",   // ngày lưu baseline (null nếu chưa)
  "resourceLimits": { "NC": 150 },// giới hạn nguồn lực/ngày
  "savedAt": "2026-11-26T09:00:00Z",
  "tasks": [                      // THỨ TỰ = STT
    {
      "id": "t1abc",              // khoá duy nhất, liên kết trỏ theo id (đổi thứ tự dòng không hỏng liên kết)
      "code": "A1",               // mã riêng (tuỳ chọn)
      "name": "Nhận mặt bằng…",
      "type": "viec",             // "viec" | "moc" | "hangmuc"
      "level": 0,                 // cấp thụt lề; dòng có dòng con cấp sâu hơn ngay sau = hạng mục
      "duration": 7,              // ngày làm việc (mốc = 0)
      "start": null,              // yyyy-mm-dd — chỉ dùng khi không có tiền nhiệm
      "preds": [ { "id": "t0xyz", "type": "FS", "lag": 0 } ],
      "constraint": null,         // { "type": "SNET|SNLT|FNET|FNLT|MSO|MFO", "date": "yyyy-mm-dd" }
      "resources": "NC:6",
      "progress": 0,              // % hoàn thành 0..100
      "progressLog": [ { "date": "2027-03-01", "pct": 30 } ],  // lịch sử % theo ngày báo cáo
      "note": "",
      "baseline": { "start": "2027-01-04", "finish": "2027-01-10", "duration": 7 }  // hoặc null
    }
  ]
}
```
Kết quả CPM (ES/EF/dự trữ…) **không lưu** trong file — luôn tính lại khi mở.

## Giới hạn hiện tại
- Chưa nhập MS Project XML.
- Chưa kéo thả thanh Gantt để đổi ngày (sửa trong bảng).
- Không làm 4D/BIM (theo yêu cầu).
- Trang in: liên kết giữa 2 trang khác nhau không vẽ.
