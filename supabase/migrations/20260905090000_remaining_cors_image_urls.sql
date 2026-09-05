-- Finish the CORS-friendly image URL rewrite.
--
-- 20260904210000 rewrote 33 of the 42 Wikimedia URLs in the database. Its map
-- was generated from the URLs present in the live tables at the time; nine more
-- were found afterwards in scripts/hp-seed-data.ts and supabase/seed.sql. Those
-- seed files were updated in the same commit, but the nine were never added to
-- the migration's map, so the rows kept the old commons.wikimedia.org host.
--
-- The nine cover Ancient Olympia, Katakolo and Kourouta - including the place
-- that currently leads the feed - so they are the most visible ones remaining.
--
-- Resolved the same way as the first batch: through the Commons API
-- (action=query&prop=imageinfo, iiurlwidth=1200), utm_* parameters stripped.
-- Both upload.wikimedia.org and thumb.wikimedia.org send
-- Access-Control-Allow-Origin: *.
--
-- Idempotent: matches on the old URL, so re-running is a no-op.

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1%20-%20panoramio%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg/1280px-%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/20190507%20061%20olympia%20museum.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/20190507_061_olympia_museum.jpg/1280px-20190507_061_olympia_museum.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20the%20archaeological%20site%20of%20Ancient%20Olympia%2C%20Greece%20%2851223832734%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg/1280px-Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo%20Port.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/1280px-Katakolo_Port.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-Kiani%20Akti%20beach.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Katakolo-Kiani_Akti_beach.jpg/1280px-Katakolo-Kiani_Akti_beach.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Katakolo-sunset.jpg/1280px-Katakolo-sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Museum%20of%20the%20History%20of%20the%20Ancient%20Olympic%20Games%2C%20Archaia%20Olympia%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg/1280px-Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Olympia%20the%20stadium.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Olympia_the_stadium.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20in%20Kourouta%2C%20western%20Peloponnese%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg/1280px-Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg')
)
update public.places p
   set image_url = m.new_url
  from url_map m
 where p.image_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1%20-%20panoramio%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg/1280px-%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/20190507%20061%20olympia%20museum.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/20190507_061_olympia_museum.jpg/1280px-20190507_061_olympia_museum.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20the%20archaeological%20site%20of%20Ancient%20Olympia%2C%20Greece%20%2851223832734%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg/1280px-Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo%20Port.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/1280px-Katakolo_Port.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-Kiani%20Akti%20beach.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Katakolo-Kiani_Akti_beach.jpg/1280px-Katakolo-Kiani_Akti_beach.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Katakolo-sunset.jpg/1280px-Katakolo-sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Museum%20of%20the%20History%20of%20the%20Ancient%20Olympic%20Games%2C%20Archaia%20Olympia%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg/1280px-Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Olympia%20the%20stadium.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Olympia_the_stadium.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20in%20Kourouta%2C%20western%20Peloponnese%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg/1280px-Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg')
)
update public.place_avatars a
   set avatar_url = m.new_url
  from url_map m
 where a.avatar_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1%20-%20panoramio%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg/1280px-%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/20190507%20061%20olympia%20museum.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/20190507_061_olympia_museum.jpg/1280px-20190507_061_olympia_museum.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20the%20archaeological%20site%20of%20Ancient%20Olympia%2C%20Greece%20%2851223832734%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg/1280px-Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo%20Port.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/1280px-Katakolo_Port.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-Kiani%20Akti%20beach.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Katakolo-Kiani_Akti_beach.jpg/1280px-Katakolo-Kiani_Akti_beach.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Katakolo-sunset.jpg/1280px-Katakolo-sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Museum%20of%20the%20History%20of%20the%20Ancient%20Olympic%20Games%2C%20Archaia%20Olympia%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg/1280px-Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Olympia%20the%20stadium.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Olympia_the_stadium.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20in%20Kourouta%2C%20western%20Peloponnese%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg/1280px-Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg')
)
update public.stories s
   set media_url = m.new_url
  from url_map m
 where s.media_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1%20-%20panoramio%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg/1280px-%CE%9A%CE%BF%CF%85%CF%81%CE%BF%CF%8D%CF%84%CE%B1_-_panoramio_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/20190507%20061%20olympia%20museum.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/20190507_061_olympia_museum.jpg/1280px-20190507_061_olympia_museum.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20the%20archaeological%20site%20of%20Ancient%20Olympia%2C%20Greece%20%2851223832734%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg/1280px-Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo%20Port.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/1280px-Katakolo_Port.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-Kiani%20Akti%20beach.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Katakolo-Kiani_Akti_beach.jpg/1280px-Katakolo-Kiani_Akti_beach.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Katakolo-sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Katakolo-sunset.jpg/1280px-Katakolo-sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Museum%20of%20the%20History%20of%20the%20Ancient%20Olympic%20Games%2C%20Archaia%20Olympia%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg/1280px-Museum_of_the_History_of_the_Ancient_Olympic_Games%2C_Archaia_Olympia_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Olympia%20the%20stadium.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Olympia_the_stadium.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20in%20Kourouta%2C%20western%20Peloponnese%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg/1280px-Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg')
)
update public.posts po
   set image_url = m.new_url
  from url_map m
 where po.image_url = m.old_url;

