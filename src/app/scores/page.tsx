import { redirect } from "next/navigation";

// One live-scores experience: the Live Sports Board (only the games we have a play on).
export default function ScoresPage() {
  redirect("/live-sports-board");
}
