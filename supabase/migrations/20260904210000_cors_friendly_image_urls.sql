-- Point Wikimedia images at a host that allows cross-origin reads.
--
-- WHY
-- Place photos referenced commons.wikimedia.org/wiki/Special:FilePath/..., which
-- is a redirect endpoint on the wiki host and sends no Access-Control-Allow-Origin
-- header. src/lib/hp/image-cache.ts fetches images with mode: "cors" so it can
-- downscale them to ~256px thumbnails and cache the result in IndexedDB. That
-- fetch was rejected for every one of these URLs.
--
-- The cache degrades gracefully, so photos still displayed - it fell back to the
-- original remote URL. The cost was silent: the app downloaded full 1200-2000px
-- originals to render 48-80px map markers, on every visit, with no caching.
--
-- FIX
-- Wikimedia's media hosts upload.wikimedia.org and thumb.wikimedia.org both send
-- Access-Control-Allow-Origin: *. Each Special:FilePath URL was resolved to its
-- canonical media URL through the Commons API (action=query&prop=imageinfo,
-- iiurlwidth=1200); utm_* tracking parameters are stripped. Same images, same
-- licensing, same attribution - just the endpoint that permits CORS.
--
-- Verified: both hosts return HTTP 200 with access-control-allow-origin: *.
--
-- Idempotent: matches on the old URL, so re-running is a no-op.
--
-- Column names verified against the live schema on 2026-09-05 after a first
-- attempt failed with 42703: place_avatars stores its URL in avatar_url, not
-- image_url. places.image_url, stories.media_url and posts.image_url are
-- correct. The failed push rolled back, so nothing was partially applied.

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20at%20Agios%20Andreas.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/81/Sunset_at_Agios_Andreas.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20Kyllini%20Beach%2C%20Greece%20%2851224121780%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg/1280px-Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20harbor.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Kyllini_harbor.JPG/1280px-Kyllini_harbor.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20beach.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Kyllini_beach.JPG/1280px-Kyllini_beach.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Roman%20baths%2C%20Loutra%20Killinis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg/1280px-Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Castello%20Chlemoutsi.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Castello_Chlemoutsi.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Chlemoutsi%20castle%20from%20the%20sea.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chlemoutsi_castle_from_the_sea.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Panagia%20Katholiki%20%28Gastouni%29%20Journal%20of%20the%20Royal%20Institute%20of%20British%20Architects%201923-12-08%20Vol%2031%20%282%29.png?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Panagia_Katholiki_%28Gastouni%29_Journal_of_the_Royal_Institute_of_British_Architects_1923-12-08_Vol_31_%282%29.png'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/House%20of%20Andreas%20Karkavitsas%20at%20Lechaina.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/87/House_of_Andreas_Karkavitsas_at_Lechaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20lake.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Kaiafa_lake.jpg/1280px-Kaiafa_lake.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20Sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Kaiafa_Sunset.jpg/1280px-Kaiafa_Sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/500px%20photo%20%28255278229%29.jpeg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/500px_photo_%28255278229%29.jpeg/1280px-500px_photo_%28255278229%29.jpeg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Beach%20of%20Kakovatos%2C%20Elis%2C%20Greece%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg/1280px-Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Looking%20inland%20from%20the%20beach%20of%20Kakovatos%2C%20Elis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg/1280px-Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Giannitsochori%20beach%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Giannitsochori_beach_-_panoramio.jpg/1280px-Giannitsochori_beach_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Samia%20acropolis.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Samia_acropolis.jpg/1280px-Samia_acropolis.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Foloi%20Forest%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Foloi_Forest_-_panoramio.jpg/1280px-Foloi_Forest_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%94%CE%AC%CF%83%CE%BF%CF%82%20%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg/1280px-%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina%20overview.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Andritsaina_overview.jpg/1280px-Andritsaina_overview.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Andritsaina.jpg/1280px-Andritsaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Temple%20of%20Apollo%20Bassae%201982.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Temple_of_Apollo_Bassae_1982.jpg/1280px-Temple_of_Apollo_Bassae_1982.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Bassae%20Temple%20of%20Apollo%20040911.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Bassae_Temple_of_Apollo_040911.jpg/1280px-Bassae_Temple_of_Apollo_040911.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20acropolis.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/1/13/Elis_acropolis.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20Agora.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/42/Elis_Agora.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pyrgos%20rathaus.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Pyrgos_rathaus.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82%20%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg/1280px-%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1%20%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg/1280px-%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1%20%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg/1280px-%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pancratium%20Maritimum%20Lechaina-Zaharo%20beach%2020140816.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg/1280px-Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg')
)
update public.places p
   set image_url = m.new_url
  from url_map m
 where p.image_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20at%20Agios%20Andreas.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/81/Sunset_at_Agios_Andreas.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20Kyllini%20Beach%2C%20Greece%20%2851224121780%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg/1280px-Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20harbor.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Kyllini_harbor.JPG/1280px-Kyllini_harbor.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20beach.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Kyllini_beach.JPG/1280px-Kyllini_beach.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Roman%20baths%2C%20Loutra%20Killinis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg/1280px-Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Castello%20Chlemoutsi.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Castello_Chlemoutsi.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Chlemoutsi%20castle%20from%20the%20sea.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chlemoutsi_castle_from_the_sea.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Panagia%20Katholiki%20%28Gastouni%29%20Journal%20of%20the%20Royal%20Institute%20of%20British%20Architects%201923-12-08%20Vol%2031%20%282%29.png?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Panagia_Katholiki_%28Gastouni%29_Journal_of_the_Royal_Institute_of_British_Architects_1923-12-08_Vol_31_%282%29.png'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/House%20of%20Andreas%20Karkavitsas%20at%20Lechaina.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/87/House_of_Andreas_Karkavitsas_at_Lechaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20lake.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Kaiafa_lake.jpg/1280px-Kaiafa_lake.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20Sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Kaiafa_Sunset.jpg/1280px-Kaiafa_Sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/500px%20photo%20%28255278229%29.jpeg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/500px_photo_%28255278229%29.jpeg/1280px-500px_photo_%28255278229%29.jpeg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Beach%20of%20Kakovatos%2C%20Elis%2C%20Greece%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg/1280px-Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Looking%20inland%20from%20the%20beach%20of%20Kakovatos%2C%20Elis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg/1280px-Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Giannitsochori%20beach%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Giannitsochori_beach_-_panoramio.jpg/1280px-Giannitsochori_beach_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Samia%20acropolis.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Samia_acropolis.jpg/1280px-Samia_acropolis.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Foloi%20Forest%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Foloi_Forest_-_panoramio.jpg/1280px-Foloi_Forest_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%94%CE%AC%CF%83%CE%BF%CF%82%20%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg/1280px-%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina%20overview.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Andritsaina_overview.jpg/1280px-Andritsaina_overview.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Andritsaina.jpg/1280px-Andritsaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Temple%20of%20Apollo%20Bassae%201982.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Temple_of_Apollo_Bassae_1982.jpg/1280px-Temple_of_Apollo_Bassae_1982.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Bassae%20Temple%20of%20Apollo%20040911.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Bassae_Temple_of_Apollo_040911.jpg/1280px-Bassae_Temple_of_Apollo_040911.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20acropolis.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/1/13/Elis_acropolis.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20Agora.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/42/Elis_Agora.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pyrgos%20rathaus.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Pyrgos_rathaus.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82%20%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg/1280px-%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1%20%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg/1280px-%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1%20%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg/1280px-%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pancratium%20Maritimum%20Lechaina-Zaharo%20beach%2020140816.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg/1280px-Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg')
)
update public.place_avatars a
   set avatar_url = m.new_url
  from url_map m
 where a.avatar_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20at%20Agios%20Andreas.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/81/Sunset_at_Agios_Andreas.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20Kyllini%20Beach%2C%20Greece%20%2851224121780%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg/1280px-Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20harbor.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Kyllini_harbor.JPG/1280px-Kyllini_harbor.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20beach.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Kyllini_beach.JPG/1280px-Kyllini_beach.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Roman%20baths%2C%20Loutra%20Killinis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg/1280px-Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Castello%20Chlemoutsi.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Castello_Chlemoutsi.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Chlemoutsi%20castle%20from%20the%20sea.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chlemoutsi_castle_from_the_sea.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Panagia%20Katholiki%20%28Gastouni%29%20Journal%20of%20the%20Royal%20Institute%20of%20British%20Architects%201923-12-08%20Vol%2031%20%282%29.png?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Panagia_Katholiki_%28Gastouni%29_Journal_of_the_Royal_Institute_of_British_Architects_1923-12-08_Vol_31_%282%29.png'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/House%20of%20Andreas%20Karkavitsas%20at%20Lechaina.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/87/House_of_Andreas_Karkavitsas_at_Lechaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20lake.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Kaiafa_lake.jpg/1280px-Kaiafa_lake.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20Sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Kaiafa_Sunset.jpg/1280px-Kaiafa_Sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/500px%20photo%20%28255278229%29.jpeg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/500px_photo_%28255278229%29.jpeg/1280px-500px_photo_%28255278229%29.jpeg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Beach%20of%20Kakovatos%2C%20Elis%2C%20Greece%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg/1280px-Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Looking%20inland%20from%20the%20beach%20of%20Kakovatos%2C%20Elis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg/1280px-Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Giannitsochori%20beach%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Giannitsochori_beach_-_panoramio.jpg/1280px-Giannitsochori_beach_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Samia%20acropolis.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Samia_acropolis.jpg/1280px-Samia_acropolis.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Foloi%20Forest%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Foloi_Forest_-_panoramio.jpg/1280px-Foloi_Forest_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%94%CE%AC%CF%83%CE%BF%CF%82%20%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg/1280px-%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina%20overview.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Andritsaina_overview.jpg/1280px-Andritsaina_overview.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Andritsaina.jpg/1280px-Andritsaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Temple%20of%20Apollo%20Bassae%201982.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Temple_of_Apollo_Bassae_1982.jpg/1280px-Temple_of_Apollo_Bassae_1982.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Bassae%20Temple%20of%20Apollo%20040911.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Bassae_Temple_of_Apollo_040911.jpg/1280px-Bassae_Temple_of_Apollo_040911.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20acropolis.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/1/13/Elis_acropolis.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20Agora.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/42/Elis_Agora.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pyrgos%20rathaus.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Pyrgos_rathaus.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82%20%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg/1280px-%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1%20%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg/1280px-%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1%20%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg/1280px-%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pancratium%20Maritimum%20Lechaina-Zaharo%20beach%2020140816.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg/1280px-Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg')
)
update public.stories s
   set media_url = m.new_url
  from url_map m
 where s.media_url = m.old_url;

with url_map(old_url, new_url) as (
  values
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Sunset%20at%20Agios%20Andreas.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/81/Sunset_at_Agios_Andreas.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Aerial%20view%20of%20Kyllini%20Beach%2C%20Greece%20%2851224121780%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg/1280px-Aerial_view_of_Kyllini_Beach%2C_Greece_%2851224121780%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20harbor.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Kyllini_harbor.JPG/1280px-Kyllini_harbor.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kyllini%20beach.JPG?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Kyllini_beach.JPG/1280px-Kyllini_beach.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Roman%20baths%2C%20Loutra%20Killinis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg/1280px-Roman_baths%2C_Loutra_Killinis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Castello%20Chlemoutsi.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Castello_Chlemoutsi.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Chlemoutsi%20castle%20from%20the%20sea.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chlemoutsi_castle_from_the_sea.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Panagia%20Katholiki%20%28Gastouni%29%20Journal%20of%20the%20Royal%20Institute%20of%20British%20Architects%201923-12-08%20Vol%2031%20%282%29.png?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Panagia_Katholiki_%28Gastouni%29_Journal_of_the_Royal_Institute_of_British_Architects_1923-12-08_Vol_31_%282%29.png'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/House%20of%20Andreas%20Karkavitsas%20at%20Lechaina.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/8/87/House_of_Andreas_Karkavitsas_at_Lechaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20lake.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Kaiafa_lake.jpg/1280px-Kaiafa_lake.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Kaiafa%20Sunset.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Kaiafa_Sunset.jpg/1280px-Kaiafa_Sunset.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/500px%20photo%20%28255278229%29.jpeg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/500px_photo_%28255278229%29.jpeg/1280px-500px_photo_%28255278229%29.jpeg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Beach%20of%20Kakovatos%2C%20Elis%2C%20Greece%20%281%29.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg/1280px-Beach_of_Kakovatos%2C_Elis%2C_Greece_%281%29.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Looking%20inland%20from%20the%20beach%20of%20Kakovatos%2C%20Elis%2C%20Greece.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg/1280px-Looking_inland_from_the_beach_of_Kakovatos%2C_Elis%2C_Greece.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Giannitsochori%20beach%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Giannitsochori_beach_-_panoramio.jpg/1280px-Giannitsochori_beach_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Samia%20acropolis.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Samia_acropolis.jpg/1280px-Samia_acropolis.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Foloi%20Forest%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Foloi_Forest_-_panoramio.jpg/1280px-Foloi_Forest_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%94%CE%AC%CF%83%CE%BF%CF%82%20%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82%20-%20panoramio.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg/1280px-%CE%94%CE%AC%CF%83%CE%BF%CF%82_%CE%A6%CE%BF%CE%BB%CF%8C%CE%B7%CF%82_-_panoramio.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina%20overview.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Andritsaina_overview.jpg/1280px-Andritsaina_overview.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Andritsaina.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Andritsaina.jpg/1280px-Andritsaina.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Temple%20of%20Apollo%20Bassae%201982.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Temple_of_Apollo_Bassae_1982.jpg/1280px-Temple_of_Apollo_Bassae_1982.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Bassae%20Temple%20of%20Apollo%20040911.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Bassae_Temple_of_Apollo_040911.jpg/1280px-Bassae_Temple_of_Apollo_040911.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20acropolis.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/1/13/Elis_acropolis.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Elis%20Agora.JPG?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/4/42/Elis_Agora.JPG'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pyrgos%20rathaus.jpg?width=1200', 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Pyrgos_rathaus.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82%20%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg/1280px-%CE%9A%CE%B9%CE%BD%CE%B7%CE%BC%CE%B1%CF%84%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%BF%CF%82_%C2%AB%CE%A1%CE%AD%CE%BE%C2%BB.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1%20%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg/1280px-%CE%A0%CE%BB%CE%B1%CF%84%CE%B5%CE%AF%CE%B1_%CE%91%CE%BC%CE%B1%CE%BB%CE%B9%CE%AC%CE%B4%CE%B1.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1%20%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg/1280px-%CE%A3%CE%BA%CE%B1%CF%86%CE%B9%CE%B4%CE%B9%CE%B1_%CE%B7%CE%BB%CE%B5%CE%B9%CE%B1%CF%82.jpg'),
    ('https://commons.wikimedia.org/wiki/Special:FilePath/Pancratium%20Maritimum%20Lechaina-Zaharo%20beach%2020140816.jpg?width=1200', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg/1280px-Pancratium_Maritimum_Lechaina-Zaharo_beach_20140816.jpg')
)
update public.posts po
   set image_url = m.new_url
  from url_map m
 where po.image_url = m.old_url;
