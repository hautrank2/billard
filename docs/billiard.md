## Billiard 8, 9, 10 bi và luyện tập

Mở `/billiard` hoặc chọn **Chơi tự do và bài tập** ở sảnh. Bàn chơi chiếm
phần còn lại của màn hình, với header gọn và sidebar phải. Nút **Toàn màn
hình** ẩn header; Escape hiện lại. **Mở bàn mới** mở màn cài đặt riêng:
chọn Mr Sung (nỉ xám, bi Black) hoặc Predator (nỉ xanh, màu bi Arcos II),
chọn chế độ **8 bi / 9 bi / 10 bi / Luyện tập**, cách xếp bi (hoặc bài
luyện), rồi nhấn **Chơi**. Quay lại bàn giữ nguyên ván hiện tại.

- **1 — Ngắm:** kéo ngang để ngắm, Shift + kéo để chỉnh chậm.
  - **Z / X:** xoay góc bắn sang trái / phải. Nhấn một lần nhích khoảng
    0,09°, giữ thì xoay nhanh dần (tới khoảng 40°/s); giữ thêm Shift để xoay
    chậm đều. Tốc độ chỉnh ở nhóm `AIM_KEY_*` trong `constants.ts`.
  - **W A S D:** dời điểm chạm lên / trái / xuống / phải; Shift cho bước nhỏ.
- **2 — Từ trên:** kéo thả để xoay góc nhìn từ trên quanh bàn.
- **3 — Quan sát:** giữ chuột trái và kéo để quay quanh bàn.
- **Mũi tên:** dịch góc nhìn ở mọi chế độ; ở góc 2 và 3 dùng được cả WASD.
  Cuộn chuột thu/phóng ở cả ba chế độ.
- **Space + kéo xuống:** lên lực. Đẩy lên giảm về 0; 0% không đánh.
  Thả chuột khi vẫn giữ Space để đánh; nhả Space trước hoặc Escape để hủy.
- **Điểm chạm:** chọn trực tiếp bằng chuột trên bi cái ở góc dưới. Khi ô này
  có focus, dùng mũi tên để chỉnh hoặc Home về tâm. Phím ` cũng về tâm.
- **G — Đặt lại bi cái:** chỉ dùng được sau một cú đánh lỗi (hoặc để đặt
  bi trong bếp trước cú phá); quyền này mất khi đánh cú kế tiếp. Sau lỗi bàn
  tự chuyển sang đặt bi; nếu đã chốt hoặc thoát, nhấn G để đặt lại. Mặc định
  giữa chiều rộng, tâm trên đường bếp (nếu trống). Click vị trí hợp lệ hoặc
  kéo thả; Space hoặc Chốt xác nhận. Thoát đặt bi khôi phục vị trí cũ. Nếu
  chỗ mặc định bị chiếm, chọn điểm trống gần đó.
- **Chỉnh vật lý:** nút ở sidebar mở bảng chỉnh trực tiếp lực cơ, ma sát nỉ,
  bi–bi và băng. Giá trị áp dụng ngay cho cú kế tiếp (kể cả đang lăn), được
  lưu trên trình duyệt đó; **Chép chỉ số** chép JSON để gửi lại, **Mặc định**
  trả toàn bộ về giá trị trong `constants.ts`.
- **Đặt lại bi:** xếp lại toàn bộ bi, đặt lại lượt/lỗi và giữ mẫu bàn, cách xếp.
  Ở bài luyện, nút này bày lại vị trí hiện tại.
- **J — Gậy nhảy:** đổi giữa gậy lướt và gậy nhảy (không dùng được ở cú phá).
  **Q / E** hạ / nâng góc cơ từng 1° (Shift: 0,25°), hoặc kéo thanh Góc nâng.
- **P — Đánh an toàn (push-out):** chỉ ở 9 bi và 10 bi, cho cú đầu tiên sau cú phá.
- **R / N:** ở bài luyện, R bày lại vị trí, N sang vị trí tiếp theo.

### Ba gậy

Mỗi gậy là một bộ chỉ số riêng trong `cues.ts` với trường `type` cố định
(`break`, `glide`, `jump`); `resolveCue` chỉ cho một ô gậy nhận gậy cùng loại,
nên sau này đổi sang gậy khác cũng không đổi được vai trò.

| Gậy | Dài | Chuôi | Lực | Điểm chạm tối đa | Góc nâng |
| --- | --- | --- | --- | --- | --- |
| Phá (`break`) | 0,95 m | 12,5 mm | ×1,2 | 0,35 R | 0° |
| Lướt (`glide`) | 1,2 m | 9 mm | ×1 | 0,5 R | 0° |
| Nhảy (`jump`) | 1,08 m | 8,5 mm | ×0,8 | 0,4 R | 15–60°, mặc định 30° |

Cú phá luôn dùng gậy phá. Gậy nhảy dốc xuống đẩy bi cái vào mặt đá: phần
lực đứng nảy lên theo `tableRestitution` (0,5), bi bay theo quỹ đạo rồi nảy
vài lần trên nỉ (có sự kiện âm thanh `land`). Khi bay, bi chỉ va với bi khác
nếu thực sự chạm trong không gian 3 chiều và chỉ rơi lỗ khi đã hạ xuống. Bi
chắn càng gần càng phải nâng cơ cao; đánh quá mạnh thì bi bay qua cả bi mục
tiêu. Ở góc 1, gậy nhảy đổi camera sang nhìn từ trên khoảng 47° và dốc dần
tới 72°, lại gần hơn và nhìn ngắn hơn khi nâng cơ (`JUMP_VIEW`); đường ngắm
thành 8 đoạn mờ dần, dài 0,9 m ở góc thấp và chỉ 0,22 m ở góc cao. Cơ càng
dốc càng dễ lệch: sai số ngẫu nhiên có độ lệch chuẩn `spread × (0,2 + 0,8 × độ
nâng)` độ. Sau mỗi cú, gậy trở về gậy lướt.

### Luật

- **9 bi:** chạm bi nhỏ nhất trước; sau va chạm cần có bi vào lỗ hoặc chạm
  băng. Vào bi 9 hợp lệ (kể cả khi phá) để thắng.
- **10 bi:** như 9 bi nhưng xếp tam giác 10 bi (bi 10 giữa hàng ba, bi 2 và 3
  ở hai góc sau). Vì không có gọi lỗ, bi 10 chỉ thắng khi đã là bi nhỏ nhất;
  vào bi 10 lúc phá hoặc sớm hơn thì bi được đặt lại.
- **8 bi:** 15 bi, bi 8 giữa hàng ba, một bi trơn và một bi sọc ở hai góc
  sau. Bàn mở sau cú phá (không được chạm bi 8 trước); bi vào hợp lệ đầu tiên
  chọn nhóm trơn 1–7 hoặc sọc 9–15 (vào cả hai nhóm thì theo bi chạm đầu). Hết
  nhóm mới đánh bi 8; vào bi 8 sớm hoặc phạm lỗi khi vào bi 8 là thua ván.
  Bi 8 vào lúc phá được đặt lại.
- **Đánh an toàn (push-out):** ở 9 và 10 bi, sau cú phá (kể cả khi phá lỗi)
  được khai báo cú kế tiếp là đánh an toàn: không cần chạm bi nhỏ nhất hay
  chạm băng, chỉ lỗi khi bi cái rơi lỗ. Bi vào trong cú này không tính, bi
  chốt được đặt lại. Vì chơi một người, sau cú này bạn đánh tiếp từ vị trí mới.
- Bi được đặt lại nằm ở điểm đích; nếu bị chiếm thì lùi về phía băng cuối.

### Luyện tập

Mỗi bài có ba vị trí cố định trong `drills.ts`; mỗi lần thử là một cú đánh và
bi cái phải chạm bi 1 trước. Điểm Đạt / số lần thử được giữ khi bày lại.

| Bài | Đạt khi |
| --- | --- |
| Ăn băng | bi 1 chạm băng cách lỗ hơn 25 cm rồi vào lỗ |
| Đá băng | bi cái chạm băng trước, rồi chạm bi 1 (không phải bi chắn) |
| Nhảy bi | bay qua bi chắn (25, 18, 13 cm), chạm bi 1 và đưa vào lỗ góc; bắt đầu bằng gậy nhảy |
| Cắt mỏng | cắt khoảng 60°, 65°, 70° vào lỗ |
| Về vị trí | vào bi 1 và bi cái dừng trong vòng sáng (dừng bi, kéo bi, theo bi) |

Mỗi vị trí được test kiểm bằng một cú đánh thật với bộ vật lý mặc định, nên
khi đổi mặc định cần chạy lại test để biết bài nào trở nên không thể.

Điểm chạm theo mặt đồng hồ nằm ở góc dưới cạnh **Đặt lại góc**. Hướng dẫn
mở trong dialog. Âm thanh va bi, chạm băng, vào lỗ có nút bật/tắt; âm thanh
chỉ khởi tạo sau tương tác và dừng khi tab bị ẩn hoặc rời trang.
Âm thanh dùng 6 bản ghi trong `public/sounds/billiard/`. Mỗi file chứa cả
một chuỗi tiếng nên được cắt theo phân tích nhịp và phổ (bảng `CLIPS` trong
`audio.ts`): đầu cơ chạm bi là tiếng "tộc" trầm (năng lượng dưới 600 Hz),
bi chạm bi là tiếng "cạch" giòn đỉnh 2–3,5 kHz, đến sau 0,1–0,35 s.

| File | Đoạn dùng |
| --- | --- |
| `hit.mp3` | cú cơ nhẹ; hai tiếng bi chạm bi nhẹ |
| `hit_strong.mp3`, `hit_strong_2.mp3` | cú cơ mạnh; bi chạm bi mạnh; các tiếng gõ nhẹ về sau |
| `break.mp3` | cú cơ phá; cụm bi tung ra; hai tiếng gõ muộn |
| `hole.mp3` | bi rơi vào lỗ |
| `setup.mp3` | xếp bi (phát khi Đặt lại bi / Mở bàn mới) |

`hit_strong`, `hit_strong_2` và `break` bị vỡ tiếng (đỉnh phẳng ở 0 dBFS), nên
khi giải mã các đỉnh bị cắt được dựng lại bằng nội suy bậc ba; mọi đoạn được
chỉnh về cùng độ to (RMS của 50 ms to nhất, −14 dBFS). Bi chạm bi chọn đoạn
nhẹ/vừa/mạnh theo tốc độ va (0,6 và 2,4 m/s), cơ chọn đoạn nhẹ/mạnh theo lực
(55%). Ở cú phá, lần chạm cụm bi đầu tiên phát bản ghi cụm bi tung ra và
nuốt các tiếng chạm lẻ trong 0,3 s. Chưa có bản ghi cho băng và tiếng lăn
nên hai tiếng này vẫn tổng hợp (modal synthesis và brown noise); các tiếng
tổng hợp khác chỉ phát thay khi file chưa tải xong hoặc tải lỗi. Va nhẹ
vừa nhỏ vừa trầm hơn va mạnh, có thêm một chút vang phòng.

Hai bàn có lòng bàn 254 × 127 cm; phủ bì Mr Sung 290 × 163 cm và Predator
khoảng 290 × 165 × 80 cm. Cả sáu lỗ trên hai bàn có đường kính
114,4 mm, bằng hai lần đường kính bi. Mr Sung dùng màu Aramith Black theo
ảnh: 2 xanh dương, 3 đỏ, 4 hồng, 5 tím, 6 xanh lá, 7 nâu, 8 đen; bi sọc
9–15 có hai đầu đen. Predator dùng Arcos II: 4 tím, 5 cam, 6 xanh lá, 7 nâu
đỏ, bi sọc đầu trắng, số in trong vòng tròn có bốn vạch, bi cái có dấu tam
giác. Hình học băng/lỗ và va chạm dùng chung cấu hình; sáu hốc nằm trong
khung. Xếp cao: bi chốt (8, 9 hoặc 10, giữa cụm) tại dấu +; xếp thấp: bi 1
tại dấu +. Ba đường bếp tạo ba hình chữ nhật bằng nhau, cho đặt bi phá ở cả ba ô;
tâm bi cái được chạm đường kẻ ngang bếp nhưng không được vượt qua.

Hệ số kéo cơ và độ nhạy lực nằm trong
`src/app/billiard/_components/billiard-game/constants.ts`:
`CUE_PULLBACK_MAX` là khoảng lùi tối đa (mét), `SHOT_DRAG_PIXELS_PER_PERCENT`
là số pixel kéo cho 1% lực. Cơ lùi theo lực trong lúc kéo và về sát bi khi hủy.

Toàn bộ thông số vật lý, lực, điểm chạm bàn phím, màu bi và lỗ cùng nằm
trong file `constants.ts` ở trên (nhóm `PHYSICS_CONFIG`). Giá trị mặc định
được chọn bằng bảng **Chỉnh vật lý** khi chơi thử: ma sát lăn 0,06 nặng
hơn nỉ thật khoảng bốn lần, nên bi vẫn chậm dần đều trong 2–4 giây rồi mới
dừng hẳn thay vì lăn rất lâu như bàn thật. Test vật lý trong `scripts/test-billiard.mjs` kiểm
mô hình với bộ hệ số đo thật (Alciatore, Leckie & Greenspan, Mathavan: ma
sát lăn 0,015, lực tối đa 5 m/s, độ nảy bi 0,94…), nên đổi mặc định không
làm sai lệch việc kiểm tra; một test riêng bảo đảm bộ mặc định vẫn dừng bi
và giữ bi trên bàn.

- **Bi:** `ballMassGrams: 170`, `ballDiameterMm: 57.2`. Khối lượng cơ và điểm
  chạm tối đa giờ là chỉ số của từng gậy (`massGrams`, `maxTipOffset` trong `cues.ts`).
- **Nỉ:** bi trượt với `slidingFriction` 0,2 cho tới khi lăn đều, rồi chậm
  dần đều với `rollingFriction` 0,06 đến khi dừng hẳn; xoáy ngang tắt dần
  theo `spinningFriction`. Bi đánh tâm vì thế trượt một đoạn rồi lăn ở 5/7
  tốc độ ban đầu.
- **Điểm chạm:** điểm đầu cơ tạo vận tốc và xoáy 3 trục theo xung lực thật.
  Với gậy lướt, mép điều khiển ứng với `maxTipOffset` 0,5 bán kính; chạm 0,4 bán kính phía
  trên là lăn tự nhiên, phía dưới là kéo (draw), lệch tâm thì bi đi chậm hơn
  và xoáy nhiều hơn. Kéo/đẩy có được nhờ xoáy còn lại sau va chạm cộng ma
  sát nỉ, không cộng thêm vận tốc giả.
- **Bi–bi:** `ballRestitution` 0,9 (1 mới là không mất năng lượng); ma sát
  giảm theo tốc độ trượt (`ballFrictionMin` 0,01, `ballFrictionRange` 0,108,
  `ballFrictionDecay` 0,58) nên có hiện tượng "ném" (throw) khi cắt
  hoặc có xoáy ngang. Nhiều bi chạm cùng lúc (khai cuộc) được giải đồng thời
  để lực chia đối xứng và không sinh thêm năng lượng.
- **Băng:** mũi băng ở 63,5% chiều cao bi (`cushionHeightRatio`) nên ma sát
  băng ăn vào xoáy lăn; độ nảy `cushionRestitution` 0,95 giảm
  `cushionRestitutionLoss` 0,04 mỗi m/s (tối thiểu 0,7), đánh càng mạnh càng mất.
- **Lực:** `minimumShotSpeed` 0,65 m/s và `maximumShotSpeed` 7,5 m/s ở bi
  tâm, theo đường cong `powerCurve` 1,4 cộng phần nâng `lowPowerLift` 1,2 cho
  nửa dưới thanh lực (hết tác dụng trước 70%, không đổi 0% và 100%):
  10% ≈ 1,5 m/s, 20% ≈ 2 m/s, 30% ≈ 2,5 m/s, 50% ≈ 3,5 m/s, 75% ≈ 5,3 m/s.
  Bi cái đánh tâm một mình lăn khoảng 1,2 m ở 10%, 2,3 m ở 20%, 3,6 m ở 40%
  và 4,4 m ở 50% (tính cả bật băng). Ở 20%, bi cái cách bi mục tiêu 0,6 m
  đánh thẳng làm bi mục tiêu chạy khoảng 1 m trong gần 2 giây.
  Kéo 3,2 px mới tăng 1% lực.

`SPIN_MAX_OFFSET` và `SPIN_ARROW_STEP` điều chỉnh điểm chạm;
`CUE_PLACEMENT_KEY` chỉnh phím tắt đặt lại bi cái (mặc định G).
`POCKET_PROFILE.diameterInBalls` chỉnh tỉ lệ lỗ/bi; mặc định là 2.
Khối lượng dùng kg trong tính toán; bán kính và mô-men quán tính được suy
ra từ hai thông số gram/mm. Lực được tính thẳng ra tốc độ bi, nên khối
lượng bi/cơ không đổi tốc độ khi đánh tâm; tỉ lệ hai khối lượng chỉ quyết
định đánh lệch tâm mất bao nhiêu tốc độ. Mỗi bước 1/240 s được chia nhỏ theo tốc độ để bi nhanh
không đi quá `maxSubstepTravel` giữa hai lần kiểm tra va chạm, và cặp bi
được tua lại đúng thời điểm chạm nên góc cắt chính xác.

Trong cùng file, `POCKET_PROFILE` điều chỉnh phần lỗ: miệng lùi 12 mm so
với mũi băng, có shelf nỉ 18 mm và vành thấp hơn mặt bàn 9 mm, họng thu
dần xuống dưới. Các đoạn băng thẳng, khung bàn và bố cục giữ nguyên.
Sau khi chỉnh file, tải lại trang để tạo lại bàn và bi với kích thước mới.

Mỗi cú đánh được chấp nhận sẽ trả điểm chạm về tâm cho cú kế tiếp; ép-phê
đã chọn được chép vào cú đánh hiện tại. Trước khi tung cú ở góc 1,
`predictShotLeavesView` chạy vật lý trên bản sao của ván, theo dõi bi cái,
bi hợp lệ gần nhất và bi bị chạm đầu tiên qua camera hiện tại. Nếu một bi sắp ra
khỏi khung hình, chuyển sang góc 2 và chờ camera ổn định, hiển thị khung hình
từ trên trước khi thực hiện cú đánh. Việc này chỉ chạy khi bật nút
**Tự sang góc 2** ở sidebar (mặc định tắt; khi tắt, dự đoán cũng được bỏ
qua). Lựa chọn được nhớ trong localStorage (`billiard-auto-overhead-v2`).
Bi giữ nguyên vị trí trong lúc chuyển;
lực và ép-phê đã chọn được giữ cho cú đánh. Rời trang, ẩn tab hoặc mở hướng
dẫn trong lúc chuyển sẽ hủy cú chờ. `predictionSeconds` và
`cameraSafetyMargin` có thể chỉnh trong file hằng số. Dự đoán không phát âm
thanh, không dịch chuyển bi thật và không cộng cú đánh.

Đây là chế độ tập luyện một người với vật lý ép-phê mô phỏng; chưa có lượt
đối thủ, gọi lỗ, điều kiện phá bi giải đấu hoặc lỗi ba lần liên tiếp. Không
cần backend; trình duyệt cần hỗ trợ WebGL.

Kiểm tra vật lý, luật và thao tác Space: `node scripts/test-billiard.mjs` (Node 24+;
trên Node 22 thêm `--experimental-strip-types`).
Kiểm tra vòng đời âm thanh: `node scripts/test-billiard-audio.mjs`.

