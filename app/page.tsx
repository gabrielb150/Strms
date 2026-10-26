import ChartApp from "@/components/ChartApp";
import { loadWeek, weekIndex } from "@/lib/data";

export default function Home() {
  const index = weekIndex();
  if (!index.latest) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-bold">No chart data yet</h1>
        <p className="mt-2 text-zinc-500">Run <code>npm run mock</code> for sample data, or <code>npm run pipeline</code> to fetch the latest week.</p>
      </div>
    );
  }
  return <ChartApp initialWeek={loadWeek(index.latest)} weeks={index.weeks} />;
}
