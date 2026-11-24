import type { Metadata } from "next";

import { BilliardGame } from "./_components/billiard-game";

export const metadata: Metadata = {
  title: "Billiard · RollNine",
  description: "Billiard 8, 9, 10 bi và bài luyện tập (ăn băng, nhảy bi…) với bàn Xám và Blue. Giữ Space kéo thả để đánh, chọn tâm bi và di chuyển camera để quan sát.",
};

const BilliardPage = () => <BilliardGame />;

export default BilliardPage;
