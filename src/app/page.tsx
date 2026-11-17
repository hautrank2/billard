import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION } from "~/lib/billiard/players";
import { Lobby } from "./_components/lobby";

const HomePage = async () => {
  if (!(await cookies()).has(SESSION)) redirect("/login");
  return <Lobby />;
};

export default HomePage;
