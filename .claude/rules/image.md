---
paths:
  - "src/**/*.tsx"
---

# Ảnh dùng chung

- Dùng `next/image` cho ảnh nội dung và trang trí theo stack Util4us hiện tại; không viết `<img>` trần ở từng màn hình.
- Nếu cần viewer, xây hoặc mở rộng một component chung tại `~/components/ui/image`; các màn hình dùng lại `Image` / `ImageGroup`, không tự viết lightbox riêng. Không giả định viewer của history-app đã có trong repo này.
- Ảnh nội dung (asset, comment, ảnh upload) cần click mở viewer khi tính năng yêu cầu. Avatar, icon, logo và ảnh trang trí không mở viewer.
- Nhiều ảnh liền nhau dùng một nhóm xem chung, thứ tự theo DOM; thumbnail có bản lớn thì truyền nguồn bản lớn.
- Nút thao tác trên ảnh là nút nhỏ ở góc, không phủ kín ảnh; có tên truy cập được.
- Viewer chung phải hỗ trợ zoom quanh con trỏ, xoay, kéo, neo ảnh trong khung, reset khi đổi ảnh, Escape đóng và trả focus; stage phủ toàn màn hình, toolbar phủ bên trên, không chiếm hàng riêng làm co ảnh.
- Nếu thêm viewer, kiểm tra bàn phím, touch, màn hình nhỏ và trạng thái ảnh tải lỗi. Không cài Antd hoặc thư viện lightbox chỉ cho một màn hình.

Được điều chỉnh từ rule `image.md` của history-app để khớp alias và thư viện hiện có của Util4us.
