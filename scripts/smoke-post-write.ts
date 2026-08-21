import { createPulsePost, loadPulseData } from "../src/lib/hp-api";
import { supabase } from "../src/lib/supabase/client";

async function main() {
  const data = await loadPulseData();
  const place = data.places[0];
  if (!place) throw new Error("No places returned from Supabase.");

  const text = `Codex form smoke ${Date.now()}`;
  const post = await createPulsePost({ text, place, vibes: ["Locals"] });

  const verifyResult = await supabase
    .from("posts")
    .select("id,text,place_id,user_id")
    .eq("id", post.id)
    .single();
  if (verifyResult.error) throw verifyResult.error;
  if (verifyResult.data.text !== text) throw new Error("Inserted post text did not round-trip.");

  const deleteResult = await supabase.from("posts").delete().eq("id", post.id);
  if (deleteResult.error) throw deleteResult.error;

  console.log(
    JSON.stringify(
      {
        ok: true,
        createdPostId: post.id,
        placeId: place.id,
        verifiedText: verifyResult.data.text,
        cleanup: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
