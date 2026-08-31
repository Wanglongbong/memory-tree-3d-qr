import { FormEvent, useState } from "react";
import { MemoryTreeQr } from "./MemoryTreeQr";

const initialPayload = "https://example.com/guestbook";

export function App() {
  const [draft, setDraft] = useState(initialPayload);
  const [payload, setPayload] = useState(initialPayload);

  function applyPayload(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next) setPayload(next);
  }

  return (
    <main className="page-shell">
      <header className="hero-copy">
        <p className="eyebrow">MỘT ĐIỂM ĐẾN · HAI GÓC NHÌN</p>
        <h1>Cây Ký Ức QR 3D</h1>
        <p>
          Khám phá câu chuyện ở góc nghiêng, rồi chuyển sang góc nhìn từ trên để quét đúng mã.
        </p>
      </header>

      <form className="payload-editor" onSubmit={applyPayload}>
        <label htmlFor="payload">Đường dẫn hoặc nội dung cần mã hóa</label>
        <div>
          <input
            id="payload"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
          />
          <button type="submit">Tạo Cây Ký Ức</button>
        </div>
      </form>

      <MemoryTreeQr payload={payload} />
    </main>
  );
}
