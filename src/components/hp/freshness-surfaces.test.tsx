import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../lib/i18n";
import { buildTrafficPreviewScene } from "../../lib/hp/traffic-preview";
import { buildActivityTicks } from "../../lib/hp/activity-data";
import { buildPlaceStoryGroups } from "../../lib/hp/place-stories";
import { LiveTicker } from "./LiveTicker";
import { TrendingHero } from "./TrendingHero";
import { EventCard } from "./EventCard";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { CulturalEventCard } from "./CulturalEventCard";
import { PulseFeed } from "./PulseFeed";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const noop = () => {};
const render = (element: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider>{element}</I18nProvider>);

test("Quiet, arriving, hot, Live and three-hour ticker renders reflect actual observation age", () => {
  for (const name of ["quiet", "arriving", "hot", "live", "later"] as const) {
    const scene = buildTrafficPreviewScene(name, NOW);
    const data = scene.data;
    const ticks = buildActivityTicks(
      data.posts,
      new Map(data.places.map((place) => [place.id, place])),
      data.meetEvents,
      {
        nowMs: scene.nowMs,
        findAuthor: (post) => data.authors.find((author) => author.id === post.authorId)!,
        stories: data.stories,
      },
    );
    const html = render(<LiveTicker ticks={ticks} nowMs={scene.nowMs} />);
    if (name === "quiet" || name === "later") assert.equal(html, "");
    else {
      assert.match(html, /Europe\/Athens/);
      assert.match(html, /Αναφέρθηκε/);
      assert.match(html, /Live|Ζωντανά/);
    }
    assert.doesNotMatch(html, /pravatar/);
  }
});

test("hero renders dated records and scoped parking, never synthetic attendance or a tonight rank", () => {
  const scene = buildTrafficPreviewScene("live", NOW);
  const place = scene.data.places[0];
  const html = render(
    <TrendingHero
      place={place}
      metric={scene.activitySnapshot[place.id]}
      events={[]}
      stories={scene.data.stories}
      nowMs={scene.nowMs}
      onOpen={noop}
      onGoing={noop}
    />,
  );
  assert.doesNotMatch(html, /#1|here recently|Packed|pravatar/);
  assert.match(html, /Πληροφορίες σημείου/);
  assert.match(html, /πρόσφατες δημοσιεύσεις/);
  assert.match(html, /Europe\/Athens/);
  const later = buildTrafficPreviewScene("later", NOW);
  const oldHtml = render(
    <TrendingHero
      place={place}
      metric={later.activitySnapshot[place.id]}
      events={later.data.meetEvents}
      stories={later.data.stories}
      nowMs={later.nowMs}
      onOpen={noop}
      onGoing={noop}
    />,
  );
  assert.doesNotMatch(oldHtml, /γεμάτος|Το σχέδιο της βραδιάς|#1/);
});

test("Now feed never admits old event posts through display time, tags or busy place status", () => {
  const scene = buildTrafficPreviewScene("live", NOW);
  const data = scene.data;
  const post = {
    ...data.posts[0],
    text: "OLD_SENTINEL",
    kind: "event" as const,
    time: "Tonight",
    tags: ["live", "packed"],
    createdAt: new Date(NOW - 3 * 3_600_000).toISOString(),
  };
  const html = render(
    <PulseFeed
      posts={[post]}
      storyGroups={[]}
      activityTicks={[]}
      trendingPlace={null}
      onOpenStory={noop}
      likes={{}}
      postLikes={{}}
      toggleLike={noop}
      savedPosts={{}}
      toggleSavePost={noop}
      commentsByPost={{}}
      onOpenPost={noop}
      onOpenMap={noop}
      onShare={noop}
      onTrendingGoing={noop}
      findPlace={() => ({ ...data.places[0], status: "busy" })}
      findAuthor={() => data.authors[0]}
      findPostAuthor={() => data.authors[0]}
      nowMs={NOW}
    />,
  );
  assert.doesNotMatch(html, /OLD_SENTINEL/);
});

test("Meet cards show phases from duration and retain old scheduled announcements", () => {
  const scene = buildTrafficPreviewScene("live", NOW);
  const event = {
    ...scene.data.meetEvents[0],
    happensAt: new Date(NOW).toISOString(),
    durationMin: 90,
    createdAt: "2025-01-01T00:00:00Z",
  };
  const card = (nowMs: number) =>
    render(
      <EventCard
        event={event}
        placeName="Kourouta"
        status={null}
        onToggle={noop}
        onOpenPlace={noop}
        nowMs={nowMs}
        previewMode
      />,
    );
  assert.match(card(NOW - 1), /Προσεχώς/);
  assert.match(card(NOW), /Σε εξέλιξη/);
  const ended = card(NOW + 90 * 60_000);
  assert.match(ended, /Ολοκληρώθηκε/);
  assert.equal((ended.match(/disabled=""/g) ?? []).length, 2);
  assert.match(ended, /Europe\/Athens/);
  assert.doesNotMatch(ended, />Hot</);
  const groups = buildPlaceStoryGroups(
    scene.data.places,
    new Set(),
    scene.data.stories,
    NOW + 3_600_000,
  );
  assert.ok(groups.every((group) => !group.live));
});

test("place details retain dated historical posts without undated crowd or current-count claims", () => {
  const scene = buildTrafficPreviewScene("later", NOW);
  const place = {
    ...scene.data.places[0],
    crowd: "UNDATED_CROWD_SENTINEL",
    recentPostCount: 999,
    status: "busy" as const,
  };
  const post = {
    ...scene.data.posts[0],
    createdAt: new Date(scene.nowMs - 9 * 3_600_000).toISOString(),
    text: "Historical post remains readable",
  };
  const html = render(
    <PlaceDetailModal
      place={place}
      events={[]}
      onClose={noop}
      onSave={noop}
      saved={false}
      visited={false}
      onToggleVisited={noop}
      posts={[post]}
      onOpenMap={noop}
      onShare={noop}
      comments={[]}
      commentDraft={{
        draft: { text: "", revision: 0, status: "idle" },
        onChange: noop,
        onSubmit: async () => undefined,
        onUseGuestDraft: noop,
      }}
      findAuthor={() => scene.data.authors[0]}
      findPostAuthor={() => scene.data.authors[0]}
      storyGroups={[]}
      onOpenStory={noop}
      businessProfile={null}
      showClaimCta={false}
      onClaimPlace={noop}
      onGetDealCode={noop}
      gettingDealCode={false}
      nowMs={scene.nowMs}
      activityMetric={scene.activitySnapshot[place.id]}
    />,
  );
  assert.doesNotMatch(
    html,
    /UNDATED_CROWD_SENTINEL|999|Quiet here right now|posts today|events tonight|Recent posts/,
  );
  assert.match(html, /Historical post remains readable/);
  assert.match(html, /9 ώρες/);
  assert.match(html, /Δημοσιεύσεις για αυτό το σημείο/);
  assert.match(html, /Europe\/Athens/);
});

test("cultural event cards use the supplied Athens date and time instead of device Today", () => {
  const html = render(
    <CulturalEventCard
      event={{
        id: "culture",
        title: "Local concert",
        greekTitle: "Συναυλία",
        eventType: "concert",
        venueName: "Venue",
        area: "Ilia",
        placeId: null,
        lat: null,
        lng: null,
        eventDate: "2026-10-05T16:00:00Z",
        organizerName: "Organizer",
        organizerId: null,
        descriptionEl: "Details",
        descriptionEn: "Details",
        posterUrl: "/fixture.svg",
        ticketUrl: null,
        isPastEvent: false,
        isOfficial: false,
        likesCount: 0,
        createdAt: "2026-10-01T00:00:00Z",
      }}
      lang="EN"
      onOpenDetail={noop}
      nowMs={Date.parse("2026-10-04T21:30:00Z")}
    />,
  );
  assert.match(html, /Today.*19:00/);
  assert.match(html, /Europe\/Athens/);
});
