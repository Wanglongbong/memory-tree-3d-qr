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

Ứng dụng cho phép chọn ảnh QR (kể cả ảnh từ ứng dụng ngân hàng) hoặc nhập link/nội dung. Ảnh được đọc ngay trên thiết bị; lưới ô gốc được giữ lại thay vì sinh lại từ nội dung. Sau đó chọn cảnh, mùa, ngày/đêm, màu sắc và chuyển giữa **Vật phẩm 3D** và **Quét mã**.

## Website tĩnh

Không cần backend, tài khoản dịch vụ, khóa API hoặc Supabase. Mã và ảnh được xử lý trong trình duyệt, phông chữ đóng gói cùng website. Để dùng QR ngân hàng, chọn ảnh QR sẵn có từ ứng dụng ngân hàng; không còn biểu mẫu tạo từ số tài khoản.

Với Vercel, chọn `assets/starter` làm **Root Directory**, chạy `npm run build`, xuất thư mục `dist`. Không có Vercel Function.

## Quyền riêng tư và chia sẻ

- Ảnh QR được giải mã trong trình duyệt và không được tải lên máy chủ.
- Bản nháp được lưu trên thiết bị.
- Link 3D chứa cấu hình và lưới ô đóng gói trong URL fragment (`#p=...`), nên máy chủ không lưu dự án. Người nhận link vẫn có thể đọc dữ liệu nằm trong QR. Mã rất nhiều ô tạo link dài hơn; không dùng dịch vụ rút gọn link bên ngoài.

## Nguyên tắc cốt lõi

Mỗi ô tối mọc cỏ hoặc lá; ô sáng để lộ đất. Đất là khối vuông màu cát nâu, cỏ đổi màu theo mùa, lá phối màu riêng. Bóng xám ghi cùng tọa độ với tán lá, chồng khít khi nhìn thẳng từ trên xuống. Thân và phần lá vượt ô mờ dần theo góc nhìn. Không phủ ảnh QR lên cảnh.

Cây cao khoảng 1,8 lần bản trước, có ba tầng tán rộng 100% / 78% / 55%; đỉnh lá các tầng giữ nguyên tọa độ ô QR. Cỏ thấp 0,58–1,55 đơn vị, có sống lá gấp và ngọn xòe cong sang ô bên cạnh khi nhìn nghiêng. Gió chậm lan theo từng đợt, gốc cố định và đầu lá rung nhẹ lệch nhịp. Từ góc cao 65–88°, ngọn xòe mờ dần, chỉ còn 3–5 ngọn nhỏ chuyển động trong chính ô của mình; các cấu trúc định vị đứng yên. Lá rơi là khối mỏng lấy màu trực tiếp từ tán ở cả bốn mùa: 120 lá trên desktop, 60 trên màn hình nhỏ, 40 cho mã dày trên 105 ô. Lá rơi và hiệu ứng mùa ẩn trước khi góc QR hoàn tất; chế độ giảm chuyển động không tạo lá rơi.

Mẫu lá cỏ gốc được dựng bằng Blender, lưu tại `assets/blender/meadow-grass.blend`, có hoạt ảnh gió xem trước. Script `scripts/build_grass_asset.py` xuất hình học Y-up sang `assets/starter/src/assets/grass-blade.json` (24 đỉnh, 28 tam giác/lá) để web sử dụng trực tiếp, không phải một mô hình tham khảo tách rời. Dáng bụi thấp tham khảo [Poa annua của RHS](https://www.rhs.org.uk/plants/119102/poa-annua/details); không đóng gói lại ảnh tham khảo. Chạy `blender --background --python scripts/build_grass_asset.py` từ gốc repo để dựng lại mô hình và ảnh xem trước.

Ảnh tải lên giữ lưới thực tế (21–177 ô mỗi cạnh) sau hiệu chỉnh phối cảnh và kiểm tra giải mã lại. Ảnh quá mờ hoặc nghiêng bị từ chối thay vì âm thầm tạo lại mã. Link/chữ được sinh mã mới với mức sửa lỗi `H`. Luôn giữ viền trống bốn ô và độ tương phản với nền đất. Chế độ giảm chuyển động tắt gió và hạt. Link cũ tiếp tục mở được.

## Kiểm tra

```bash
./scripts/check_starter.sh
```

Kiểm tra QR đơn sắc, bảng màu lấy trực tiếp từ nguồn, lưới ảnh gốc ở 21/37/65/177 ô, ảnh xoay/đảo màu/phối cảnh, link chia sẻ và tương thích bản cũ. Bộ đọc có giới hạn với ảnh phối cảnh mạnh, nhất là mã rất ít hoặc rất nhiều ô; nên dùng ảnh gốc rõ nét. Kiểm tra thêm ảnh chụp cảnh 3D ở nhiều thời điểm gió và kích thước màn hình; kiểm thử tự động không thay thế quét camera điện thoại thực tế.

`npm run verify:nature` kiểm tra độ cao/tọa độ ba tầng tán, phạm vi chuyển động lõi cỏ, ô định vị, giới hạn số lá rơi và giá trị hoạt ảnh ở nhiều thời điểm cho mã 37/177 ô.

## License

MIT
