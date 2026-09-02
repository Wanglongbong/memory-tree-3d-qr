# Cây Kí Ức · QR Diorama Studio

Một website React/Vite/Three.js và Codex skill để biến **mã QR thật** thành Cây Kí Ức, Vườn Đèn Lồng hoặc Hồ Koi 3D, đồng thời vẫn có góc nhìn từ trên xuống đủ tương phản để quét.

## Có gì trong repository?

- `SKILL.md`: quy trình để Codex tạo hoặc tích hợp Cây Ký Ức QR 3D.
- `assets/starter/`: ứng dụng web hoàn chỉnh, có thể deploy trực tiếp lên Vercel.
- `references/`: nguyên tắc thiết kế và hướng dẫn tích hợp.
- `scripts/check_starter.sh`: kiểm tra TypeScript, QR round trip và production build.

## Cài làm Codex skill

Yêu cầu Codex:

```text
Use $skill-installer to install https://github.com/Wanglongbong/memory-tree-3d-qr
```

Sau khi cài, có thể gọi trực tiếp:

```text
Use $memory-tree-3d-qr to add a scan-safe 3D Memory Tree QR for https://example.com/guestbook to my React site.
```

## Chạy bản demo

```bash
cd assets/starter
npm install
npm run dev
```

Ứng dụng cho phép tải ảnh QR để đọc ngay trên thiết bị, nhập link/nội dung hoặc tạo VietQR bằng số tài khoản ngân hàng Việt Nam. Sau đó chọn cảnh, mùa, ngày/đêm, màu sắc và chuyển giữa **Vật phẩm 3D** và **Quét mã**. Các module co cụm thành vật phẩm ở góc thấp, rồi trải ra đúng ma trận khi camera lên cao; sàn và QR đều dùng bảng màu đa sắc của cảnh.

## Kết nối VietQR

Sao chép `.env.example` thành `.env.local`, rồi điền `VIETQR_CLIENT_ID` và `VIETQR_API_KEY` lấy từ tài khoản VietQR. Khi deploy, đặt hai biến này trong Vercel Project Settings. Không đưa khóa API vào biến có tiền tố `VITE_`.

Với Vercel, chọn `assets/starter` làm **Root Directory**. Quảng cáo mặc định tắt bằng `VITE_ADS_MODE=off`; giao diện tạo và xem thử không phụ thuộc quảng cáo.

## Quyền riêng tư và chia sẻ

- Ảnh QR được giải mã trong trình duyệt và không được tải lên máy chủ.
- Bản nháp được lưu trên thiết bị.
- Link 3D chứa cấu hình trong URL fragment (`#p=...`), nên máy chủ không lưu dự án. Người nhận link vẫn có thể đọc dữ liệu nằm trong QR.
- Form VietQR gửi thông tin ngân hàng tới VietQR thông qua Vercel Function và không ghi log nội dung request.

## Nguyên tắc cốt lõi

Mô hình 3D chỉ là lớp nghệ thuật. Chế độ quét luôn dùng đúng ma trận QR được sinh từ payload cuối cùng, mức sửa lỗi `H`, nền sáng đồng nhất và quiet zone bốn ô. Repo không chứa số tài khoản, khóa VietQR hay dữ liệu cá nhân mẫu.

## Kiểm tra

```bash
./scripts/check_starter.sh
```

Kiểm tra tự động cả QR đơn sắc lẫn ba bảng màu đa sắc, giải mã lại đúng payload, chạy TypeScript và build Vite. Trước khi phát hành, vẫn nên thử quét màn hình thật bằng hai ứng dụng camera khác nhau.

## License

MIT
