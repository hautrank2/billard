# Showcase — tám hướng thiết kế

`landing.json` là cấu hình duy nhất cho nội dung công ty, theme, hero và tour.
Server kiểm tra cấu hình bằng Zod trước khi render. Forma, số liệu, đối tác và sản phẩm
đều là minh hoạ. Ảnh kết hợp nguồn Unsplash, NASA và Imagegen; tất cả được tối ưu thành WebP local.

| Theme | Route | Phong cách |
| --- | --- | --- |
| Studio | `/showcase/studio` | Bản 1 được giữ: ivory, terracotta, dashboard nổi |
| Midnight | `/showcase/midnight` | Bản 2 được giữ: navy, lime, dashboard đảo bên, terminal |
| Blueprint | `/showcase/blueprint` | Bản 4 được giữ: cobalt, lưới kỹ thuật, đường mạch và scan |
| Aurora | `/showcase/aurora` | Theme 4 hiện tại: vũ trụ NASA, hành tinh, sao băng và quỹ đạo |
| Liquid | `/showcase/liquid` | Reference 1: chrome WebGL, starfield, kính tối |
| Atelier | `/showcase/atelier` | Ảnh tòa nhà văn phòng Unsplash, serif, hotspot và bảng năng lực |
| Momentum | `/showcase/momentum` | Robot trắng/xanh, editorial type, nền văn phòng và ghi chú nổi |
| Nexus | `/showcase/nexus` | Smart city navy/cyan, dashboard kính Three.js, 3 Metric Card và biểu đồ cột 3D |

Studio, Midnight, Blueprint và Aurora giữ nguyên ID chia sẻ. Sáu theme cũ còn lại
được bỏ theo yêu cầu. `edition` được đánh lại 01–08 theo danh sách mới.
`/showcase` dùng `defaultTheme`; `?theme=<id>` vẫn hoạt động. Route không tồn tại trả 404.
Chuyển theme cập nhật URL, tiêu đề và đưa trang về hero; Back/Forward đồng bộ lại.
Copy link luôn tạo `/showcase/<id>`. Motion giữ trạng thái khi đổi theme.

## Component và shadcn

- `landing/index.tsx`: compose trang; không chứa markup từng section.
- `hook.ts`: URL, motion, reveal, counter, pointer spotlight/tilt và reading progress.
- `company-sections.tsx`: nội dung chung; custom từ Card, Button và Badge.
- `product-section.tsx`: Tabs điều khiển category, Card và Dialog chi tiết sản phẩm.
- `site-header.tsx`: header sticky, menu mobile, Button CTA.
- `theme-switcher.tsx`: thanh nổi, Dialog gallery, Button và Tooltip.
- `hero/`: năm loại hero (`dashboard`, `liquid`, `architecture`, `portrait`, `city`).
- `liquid-scene/`: shader WebGL, hook quản lý lifecycle và fallback CSS.
- `nexus-scene/`: dashboard Three.js với mặt kính, 3 Metric Card và biểu đồ
  cột có chiều sâu. CSS3DRenderer giữ nhãn/control HTML dùng Tailwind; dữ liệu
  minh họa nằm trong `themes[].dashboard`, được Zod kiểm tra.
- `product-preview.tsx`: mockup dùng chung cho sản phẩm và tour.
- `type.ts`: schema nội dung, theme, hero và props.

Các primitive có sẵn trong `src/components/ui/` được dùng bằng composition/className;
không fork hoặc sửa primitive. FAQ dùng disclosure `<details>` native.

## Nội dung và thêm theme

`company`, `sections`, `services`, `categories`, `projects`, `overview`, `reasons`,
`partners`, `process`, `faqs`, `experience` chứa toàn bộ copy chính.
Theme khai báo màu, font, radius, headline và `hero`:

- `kind`: chọn visual; thêm kind mới cần cập nhật schema và renderer.
- `image` / `imageAlt`: ảnh trong `/showcase/` và mô tả.
- `label`, `feature`, `supporting`, `metric`, `metricLabel`, `cards`: nội dung riêng.
- `cards`: dùng cho hotspot, capability selector hoặc infrastructure console.

Màu chỉ nằm trong JSON; CSS dùng `--lp-*`. Các biến shadcn được ánh xạ vào palette
trên `.page`, cả trong Dialog portal. Giữ font local và giấy phép OFL ở `_fonts/`.
Ảnh và prompt: `docs/showcase-assets.md`.

## Motion và kiểm tra

Có title blur-in, image reveal, staggered sections, counter, marquee, card tilt,
spotlight theo chuột, magnetic CTA, shine, floating surfaces, orbital glow, circuit
flow, scan, shader chrome và phản hồi khi đổi capability.

Liquid giới hạn khoảng 30fps, resolution có trần và dừng khi ngoài viewport/trang ẩn.
Cleanup huỷ rAF, observer, listeners, shaders, buffer và program. WebGL lỗi có fallback CSS.
Motion off và `prefers-reduced-motion` giữ nội dung đọc được và số liệu đầy đủ.
Nexus hỗ trợ giữ chuột/chạm và kéo để xoay 360° theo cả hai trục; thả giữ
nguyên góc nhìn. Phím mũi tên xoay khi focus Scene, Home/nút reset trả góc gốc.
Kéo không kích hoạt nhầm cột; click/tap cột vẫn giữ giá trị đã chọn.
Xoay thủ công vẫn hoạt động khi Motion off hoặc giảm chuyển động.
Nexus giới hạn 30fps và DPR 1.75, dừng khi ngoài viewport hoặc tab ẩn;
Motion off/giảm chuyển động giữ góc nhìn tĩnh. Hover/focus cột hiển thị giá trị.
WebGL không khả dụng thì giữ dashboard HTML và biểu đồ Tailwind. Unmount/đổi
theme giải phóng renderer, geometry, material, observers và listeners.
Pointer effects chỉ bật cho con trỏ chính xác. Không dùng thư viện animation mới.

Kiểm tra `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; browser QA gồm tám theme,
desktop/mobile, heading không bị cắt, URL trực tiếp/refresh/Back/Forward, Copy link,
keyboard Tabs/Dialog, Motion off, hotspot, capability/console và trang chủ.

## Cập nhật hình ảnh và backdrop

Verdant đã được gỡ khỏi cấu hình, renderer, schema và CSS. Còn tám theme; các ID khác giữ nguyên.
Atelier dùng `office-building-v3.webp` (Darien Attridge / Unsplash), Momentum dùng
`momentum-robot-v3.webp`. Aurora dùng `cosmos-v4.webp` (NASA, ESA, CSA, STScI).
Studio, Midnight, Blueprint, Aurora, Liquid và Momentum có `hero.background` riêng,
render bởi lớp scenic backdrop dùng chung. Atelier và Nexus tiếp tục dùng background riêng.
`hero.credit` khai báo link nguồn ảnh trên hero; nguồn và prompt lưu ở `docs/showcase-assets.md`.

Hero của cả tám theme dùng toàn bộ chiều rộng container, không có viền/bo góc ngoài.
Aurora dùng ảnh NASA 4096px,
giảm bão hòa với vùng tối trung tâm; tiêu đề highlight dùng màu đặc để giữ tương phản.
