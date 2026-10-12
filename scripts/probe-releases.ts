import { fetchUpcomingReleases } from "@/lib/releases";

async function main() {
  const r = await fetchUpcomingReleases();
  console.log("errors:", r.errors);
  console.log("count:", r.releases.length);
  let withImage = 0;
  for (const x of r.releases) {
    if (x.imageUrl) withImage++;
    console.log(
      (x.date ?? "TBA").padEnd(12),
      x.label.padEnd(12),
      x.name.slice(0, 45).padEnd(46),
      x.imageUrl ? "IMG" : "---",
    );
    if (x.imageUrl) console.log("".padEnd(12), "".padEnd(12), "".padEnd(46), x.imageUrl.slice(0, 110));
  }
  console.log(`with image: ${withImage}/${r.releases.length}`);
}

main();
