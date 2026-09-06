-- Replace third-party hotlinked place photos with CORS-friendly, license-clear ones.
--
-- WHY
-- Nine public.places rows point image_url at visit-olympia.gr (4), justforonesummer.com
-- (2) and visitkatakolon.gr (3) - third-party tourism sites, not Wikimedia. Same failure
-- mode as 20260904210000/20260905090000: none of these hosts send
-- Access-Control-Allow-Origin, so src/lib/hp/image-cache.ts's mode: "cors" fetch is
-- rejected and every visit downloads the full-size original instead of a cached
-- thumbnail. On top of that, none of the three sites' photos have a confirmed license
-- for reuse in this app - CLAUDE.md's known issues list flagged this as "CORS and
-- licensing both unresolved."
--
-- FIX (partial - 2 of 9)
-- Searched Wikimedia Commons (by place name, Greek-language name, and a geosearch
-- against each place's stored lat/lon) for a same-subject, properly licensed
-- replacement. Found confident matches for two:
--
--   skafidia-monastery (visitkatakolon.gr/.../monastery2.jpg)
--     -> File:Monastery_of_Skafidia.JPG, own work by Kolchak1923, CC0. Filename,
--        subject and Commons category ("Skafidia Monastery") all match the place.
--
--   mercouri-estate (visitkatakolon.gr/.../Mercouri-Estate.jpeg)
--     -> File:Κτήμα_Μερκούρη_-_panoramio.jpg (Ktima Merkouri = Mercouri Estate),
--        CC BY-SA 3.0, passed Panoramio-bot copyright review. Its embedded GPS
--        (37.676659, 21.309988) is ~30m from the place's stored coordinates
--        (37.676718, 21.310257) - same location.
--
-- Both resolved to their canonical media URL the same way as the prior two
-- migrations: through the Commons API (action=query&prop=imageinfo,
-- iiurlwidth=1200), utm_* tracking parameters stripped. Both upload.wikimedia.org
-- and thumb.wikimedia.org verified to return HTTP 200 with
-- access-control-allow-origin: *.
--
-- The remaining 7 rows (palouki-beach, arkoudi-beach, glyfa-beach, vartholomio,
-- nemouta-waterfalls, nemouta-village, korakochori) are deliberately NOT included
-- here. No Commons file was found that both depicts the correct place and carries
-- a clear license - the closest hits were either a different place with a similar
-- name (e.g. the Ionian island Arkoudi, not the Arkoudi near Pineios), a subject
-- that doesn't match the place (a church photo for a beach entry), or no coverage
-- at all (Palouki, Glyfa, Vartholomio, Nemouta, Korakochori returned nothing
-- specific to this location). Forcing a mismatched photo in to close this out
-- would trade a CORS problem for a mislabeling one, so those 7 still need a human
-- to source (or license-clear a direct photo of) a replacement.
--
-- Idempotent: matches on the old URL, so re-running is a no-op.

with url_map(old_url, new_url) as (
  values
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/monastery2.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Monastery_of_Skafidia.JPG/1280px-Monastery_of_Skafidia.JPG'),
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/Mercouri-Estate.jpeg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg/1280px-%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg')
)
update public.places p
   set image_url = m.new_url
  from url_map m
 where p.image_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/monastery2.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Monastery_of_Skafidia.JPG/1280px-Monastery_of_Skafidia.JPG'),
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/Mercouri-Estate.jpeg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg/1280px-%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg')
)
update public.place_avatars a
   set avatar_url = m.new_url
  from url_map m
 where a.avatar_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/monastery2.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Monastery_of_Skafidia.JPG/1280px-Monastery_of_Skafidia.JPG'),
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/Mercouri-Estate.jpeg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg/1280px-%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg')
)
update public.stories s
   set media_url = m.new_url
  from url_map m
 where s.media_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/monastery2.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Monastery_of_Skafidia.JPG/1280px-Monastery_of_Skafidia.JPG'),
    ('https://visitkatakolon.gr/wp-content/uploads/2015/03/Mercouri-Estate.jpeg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg/1280px-%CE%9A%CF%84%CE%AE%CE%BC%CE%B1_%CE%9C%CE%B5%CF%81%CE%BA%CE%BF%CF%8D%CF%81%CE%B7_-_panoramio.jpg')
)
update public.posts po
   set image_url = m.new_url
  from url_map m
 where po.image_url = m.old_url;
