# Cây Ký Ức QR 3D

Một Codex skill và React starter để biến **mã QR thật** thành mô hình Cây Ký Ức 3D, đồng thời vẫn có góc nhìn từ trên xuống đủ tương phản để quét.

## Có gì trong repository?

- `SKILL.md`: quy trình để Codex tạo hoặc tích hợp Cây Ký Ức QR 3D.
- `assets/starter/`: demo React + Vite + Three.js chạy độc lập.
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

Thay nội dung trong ô nhập, bấm **Tạo Cây Ký Ức**, sau đó chuyển giữa **Trưng bày 3D** và **Quét mã**.

## Nguyên tắc cốt lõi

Mô hình 3D chỉ là lớp nghệ thuật. Chế độ quét luôn dùng đúng ma trận QR được sinh từ payload cuối cùng, mức sửa lỗi `H`, nền sáng đồng nhất và quiet zone bốn ô. Repo không chứa VietQR, số tài khoản hay dữ liệu cá nhân của dự án gốc.

## Kiểm tra

```bash
./scripts/check_starter.sh
```

Kiểm tra tự động tạo PNG QR, giải mã lại đúng payload, chạy TypeScript và build Vite. Trước khi phát hành, vẫn nên thử quét màn hình thật bằng hai ứng dụng camera khác nhau.

## License

MIT
