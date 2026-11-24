# RollNine

Game billiard 3D với luật 8, 9 và 10 bi. Sảnh tại `/` có hồ sơ, kho gậy, ghép trận và chơi với máy. `/billiard` có chơi tự do và các bài tập từ Util4us. Xem [hướng dẫn chơi và mô phỏng](docs/billiard.md).

## Chạy trên máy

Cần Node.js 24.14 trở lên, pnpm và trình duyệt có WebGL. Sao chép `.env.example` thành `.env.local` và điền `MONGODB_URI` cùng `MONGODB_DB` cho MongoDB Atlas hoặc replica set có hỗ trợ giao dịch. Chế độ tự do và bài tập có thể mở trực tiếp tại `/billiard`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Mở `http://localhost:8083`. Để thử ghép trận trên cùng máy, tạo hai hồ sơ trong hai phiên trình duyệt riêng và chọn cùng luật, cùng bàn. Trong bàn, chọn góc Ngắm, đặt và chốt bi cái nếu được yêu cầu, chọn lực và bấm **Đánh**. Có thể dùng thao tác giữ Space và kéo thả trong vùng bàn.

Hồ sơ khách được lưu trong collection `user`, nhận diện bằng cookie và dùng bộ gậy tiêu chuẩn để đấu 1v1. Khách không được cấp/thưởng xu và không thể mua gậy. Đăng ký bằng Gmail đã xác thực sẽ nâng cấp hồ sơ hiện tại, tặng 200 xu một lần; lần đăng nhập sau khôi phục đúng tài khoản Google. Tài khoản Gmail thắng ván online hợp lệ được 30 xu và 10 điểm. Trận bỏ cuộc hoặc hết giờ chỉ có thưởng nếu đã diễn ra ít nhất bốn cú đánh. Kết quả tập với máy vẫn lưu trong lịch sử.

Để bật Gmail, tạo OAuth client loại **Web application** trong Google Cloud, bật scope `openid email profile`, rồi điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` vào `.env.local`. Authorized redirect URI phải trùng tuyệt đối; trên máy là `http://localhost:8083/api/auth/google/callback`, trên production dùng HTTPS. Khi ứng dụng Google đang ở chế độ Testing, thêm Gmail thử nghiệm vào danh sách test users. Không nhập email thủ công để cấp quyền: máy chủ trao đổi authorization code bằng PKCE, kiểm tra state và email đã xác thực với Google. Thiếu cấu hình sẽ hiện thông báo tại trang đăng nhập.

Sảnh `/` mặc định dùng góc nhìn thứ nhất: WASD để đi, kéo chuột hoặc bấm điều khiển chuột để nhìn/ngước, Space nhảy, C ngồi/đứng, F đánh, E chào. Esc thả chuột. Nút Toàn cảnh chuyển sang xem từ trên; mở menu sẽ tạm dừng di chuyển. Màn hình cảm ứng có nút di chuyển và động tác. Vị trí/động tác chia sẻ qua MongoDB (gửi tối đa mỗi 250 ms, đọc sảnh mỗi 750 ms), avatar nội suy khi cập nhật; presence hết hạn sau 15 giây mất kết nối. Gậy mở dialog có hình minh họa và thông số mô phỏng; Xem bàn mở dialog với 10 card và trạng thái từng bàn.

Migration MongoDB tự tạo các chỉ mục và dữ liệu gậy khi API kết nối lần đầu. Trò chơi dùng collection `user` và `cue` trong cơ sở dữ liệu `Billard`. Trận đấu, hàng chờ, lịch sử xu và phiên bản migration dùng các collection có tiền tố `black_nine_`.

## API

- `GET /api/billiard` trả về hồ sơ, gậy, hàng chờ, trận hiện tại và tối đa 12 kết quả gần nhất. Tham số `match` lấy một trận theo ID cho người tham gia.
- `POST /api/billiard` nhận JSON có trường `type`. Các thao tác gồm `profile` (tạo hoặc đổi tên hồ sơ), `cue` (mua hoặc trang bị), `queue` và `leave` (tìm đối thủ), `practice` (mở bàn với máy), `shot` (đánh), `computer` (thực hiện lượt máy), và `manage` (trả lượt, bỏ cuộc hoặc xử lý hết giờ).
- `POST /api/billiard` với `type: "motion"` cập nhật tọa độ, hướng nhìn, nhảy, ngồi và động tác trong sảnh cho phiên hiện tại. Máy chủ kiểm tra biên phòng, vật cản và trạng thái trận đấu. `GET /api/billiard?hall=1` trả thêm người chơi, bàn và chat.
- `GET /api/auth/google` bắt đầu đăng nhập Gmail; `/api/auth/google/callback` xác thực và tạo/nâng cấp tài khoản. Chỉ Google subject ID được máy chủ xác thực mới có quyền tham gia hệ thống xu.
- Cú đánh yêu cầu ID và phiên bản của trận, hướng, lực, điểm chạm, loại gậy, góc nâng và trạng thái đánh an toàn. Vị trí bi cái chỉ hợp lệ khi người chơi đang có quyền đặt bi. Máy chủ tính trạng thái bàn và cập nhật kết quả, xu và điểm trong một giao dịch.

## Kiểm tra

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

Đặt `MONGODB_TEST_URI` tới một MongoDB replica set dành cho kiểm thử khi chạy `pnpm test`. Bộ kiểm thử tạo và dọn một cơ sở dữ liệu ngẫu nhiên có tên bắt đầu bằng `Billard_test_`. Thiếu biến này, các kiểm thử phụ thuộc cơ sở dữ liệu sẽ được đánh dấu bỏ qua.
