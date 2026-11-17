# Black / Nine — project context

@docs/rules/source-code-rule.md
@docs/rules/complex-component-rule.md

Trò chơi billiard 3D độc lập, được chuyển từ Util4us. Trả lời bằng tiếng Việt và giữ các thay đổi khác của người dùng. Stack gồm Next.js App Router, React, TypeScript strict, Tailwind v4, shadcn/ui, Three.js, MongoDB và pnpm. Dùng alias `~/`; các thành phần UI dùng chung nằm trong `src/components/ui`.

## Cấu trúc

- `src/app/page.tsx`: sảnh, hồ sơ, gậy, ghép trận và lịch sử.
- `src/app/billiard/`: chơi tự do, bài tập, giao diện bàn 3D, luật và mô phỏng dùng chung.
- `src/app/api/billiard/route.ts`: API Node.js cho sảnh và trận đấu.
- `src/lib/billiard/` và `src/lib/billiard/migrations/`: lưu hồ sơ, gậy, xu, điểm và trận đấu. Máy chủ kiểm tra quyền đánh và tự mô phỏng cú đánh.
- `src/styles/`: CSS thuộc ứng dụng khi Tailwind không đủ. Giữ các class ngữ nghĩa ổn định để định vị vùng giao diện.
- `.claude/`: cấu hình, hướng dẫn và kỹ năng chuyển từ Util4us. Hướng dẫn cho Forma, lịch sử, ảnh và bài viết áp dụng khi có các tính năng tương ứng.

## Kiểm tra

Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test` và `pnpm build`. Kiểm tra bàn 3D bằng chuột, bàn phím và màn hình nhỏ. Dùng hai phiên trình duyệt riêng để thử ghép trận, đổi lượt, tải lại, kết thúc và đối chiếu xu/điểm. Dùng phiên riêng để thử máy và bài tập.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

Read the relevant guides in `node_modules/next/dist/docs/` before changing framework APIs, conventions or file structure.

<!-- END:nextjs-agent-rules -->
