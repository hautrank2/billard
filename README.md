# Black / Nine

Game billiard 3D với luật 8, 9 và 10 bi. Sảnh tại `/` có hồ sơ, kho gậy, ghép trận và chơi với máy. `/billiard` có chơi tự do và các bài tập từ Util4us. Xem [hướng dẫn chơi và mô phỏng](docs/billiard.md).

## Chạy trên máy

Cần Node.js 24.14 trở lên, pnpm và trình duyệt có WebGL. Sao chép `.env.example` thành `.env.local` và điền `MONGODB_URI` cùng `MONGODB_DB` cho MongoDB Atlas hoặc replica set có hỗ trợ giao dịch. Chế độ tự do và bài tập có thể mở trực tiếp tại `/billiard`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Mở `http://localhost:8083`. Để thử ghép trận trên cùng máy, tạo hai hồ sơ trong hai phiên trình duyệt riêng và chọn cùng luật, cùng bàn. Trong bàn, chọn góc Ngắm, đặt và chốt bi cái nếu được yêu cầu, chọn lực và bấm **Đánh**. Có thể dùng thao tác giữ Space và kéo thả trong vùng bàn.

Hồ sơ khách được nhận diện bằng cookie trên trình duyệt tạo hồ sơ. Mỗi hồ sơ có 200 xu và bộ gậy tiêu chuẩn. Thắng ván online hợp lệ được 30 xu và 10 điểm. Trận bỏ cuộc hoặc hết giờ chỉ có thưởng nếu đã diễn ra ít nhất bốn cú đánh. Kết quả tập với máy vẫn lưu trong lịch sử.

Migration MongoDB tự tạo các chỉ mục và dữ liệu gậy khi API kết nối lần đầu. Trò chơi dùng collection `user` và `cue` trong cơ sở dữ liệu `Billard`. Trận đấu, hàng chờ, lịch sử xu và phiên bản migration dùng các collection có tiền tố `black_nine_`.

## API

- `GET /api/billiard` trả về hồ sơ, gậy, hàng chờ, trận hiện tại và tối đa 12 kết quả gần nhất. Tham số `match` lấy một trận theo ID cho người tham gia.
- `POST /api/billiard` nhận JSON có trường `type`. Các thao tác gồm `profile` (tạo hoặc đổi tên hồ sơ), `cue` (mua hoặc trang bị), `queue` và `leave` (tìm đối thủ), `practice` (mở bàn với máy), `shot` (đánh), `computer` (thực hiện lượt máy), và `manage` (trả lượt, bỏ cuộc hoặc xử lý hết giờ).
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
