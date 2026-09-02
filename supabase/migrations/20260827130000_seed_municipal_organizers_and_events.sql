-- Real municipal cultural-events content:
--   * 3 verified "Organizer" accounts, one per municipality. These have no
--     auth.users login behind them, so organizers.user_id is made nullable.
--   * 9 confirmed festivals / panigyria, each linked to its municipality by
--     name and published straight away (real events from official bodies —
--     no moderation queue).
-- Idempotent: safe to run more than once.

begin;

-- 1. A municipality has no auth account, so allow organizers.user_id to be NULL.
--    (The UNIQUE constraint stays; Postgres permits multiple NULLs under it.)
alter table public.organizers alter column user_id drop not null;

-- 2. The three municipalities as verified organizers.
insert into public.organizers (display_name, bio, verification_status)
select v.display_name, v.bio, 'verified'
from (values
  ('Δήμος Ανδραβίδας-Κυλλήνης',
   'Επίσημος λογαριασμός του Δήμου Ανδραβίδας-Κυλλήνης. Πολιτιστικές εκδηλώσεις, φεστιβάλ και πανηγύρια της περιοχής.'),
  ('Δήμος Πηνειού',
   'Επίσημος λογαριασμός του Δήμου Πηνειού. Πολιτιστικές εκδηλώσεις, φεστιβάλ και πανηγύρια της περιοχής.'),
  ('Δήμος Ήλιδας',
   'Επίσημος λογαριασμός του Δήμου Ήλιδας. Πολιτιστικές εκδηλώσεις, φεστιβάλ και πανηγύρια της περιοχής.')
) as v(display_name, bio)
where not exists (
  select 1 from public.organizers o where o.display_name = v.display_name
);

-- 3. The nine events. event_date defaults to 20:00 local (Europe/Athens, DST
--    resolved by the zone name) — no start time was in the source data.
--    place_id is set only where a matching place already exists (LEFT JOIN);
--    venues with no place stay unlinked, no new places are created here.
insert into public.cultural_events (
  id, title, greek_title, event_type, venue_name, area, place_id, event_date,
  organizer_name, organizer_id, description_el, description_en,
  poster_url, ticket_url, is_past_event, is_official, moderation_status
)
select
  v.id, v.title, v.greek_title, v.event_type, v.venue_name, v.area, p.id,
  (v.event_day + time '20:00') at time zone 'Europe/Athens',
  v.organizer_name, o.id, v.description_el, v.description_en,
  '', null, v.is_past_event, true, 'published'
from (values
  ('municipal-2026-saske-kyllini',
   'SASKE Live Concert - Kyllini Harbor', 'Συναυλία SASKE - Λιμάνι Κυλλήνης',
   'concert', 'Λιμάνι Κυλλήνης', 'Κυλλήνη', 'kyllini-harbor', date '2026-08-09',
   'Δήμος Ανδραβίδας-Κυλλήνης',
   'Ζωντανή συναυλία του δημοφιλή ράπερ SASKE στο πλαίσιο του 15ου Διεθνούς Φεστιβάλ του Δήμου Ανδραβίδας-Κυλλήνης, στο Λιμάνι Κυλλήνης.',
   'A live concert by popular rapper SASKE, part of the 15th International Festival of the Municipality of Andravida-Kyllini, held at Kyllini Harbor.',
   true),
  ('municipal-2026-full-moon-stafidokampos',
   'Full Moon Nights - Piano and Moonlight', 'Νύχτες με Πιάνο και Φεγγάρι',
   'concert', 'Σταφιδόκαμπος', 'Σταφιδόκαμπος', null, date '2026-08-28',
   'Δήμος Ανδραβίδας-Κυλλήνης',
   'Βραδιά Πανσελήνου Αυγούστου με ρομαντική, ατμοσφαιρική μουσική παράσταση αφιερωμένη στο ποιοτικό ελληνικό τραγούδι, με πιάνο και φωνή. Μέρος του 15ου Διεθνούς Φεστιβάλ.',
   'An August full-moon evening of romantic, atmospheric music dedicated to quality Greek song, with piano and voice. Part of the 15th International Festival.',
   false),
  ('municipal-2026-vlacherna-gastronomic',
   'Traditional & Gastronomic Evening - Vlacherna Monastery', 'Μεγάλη Παραδοσιακή & Γαστρονομική Βραδιά',
   'festival', 'Αύλειος Χώρος Ιεράς Μονής Βλαχερνών', 'Κάτω Παναγιά', null, date '2026-09-06',
   'Δήμος Ανδραβίδας-Κυλλήνης',
   'Ζωντανή μουσική από το συγκρότημα ΣiΜΠΑΝΤΑ (παραδοσιακό, ρεμπέτικο, νησιώτικο), με τη συμμετοχή 7 πολιτιστικών συλλόγων στον χορό και δωρεάν τοπικά εδέσματα από τους συλλόγους της περιοχής. Μέρος του 15ου Διεθνούς Φεστιβάλ.',
   'Live music from the SiΜΠΑΝΤΑ ensemble (traditional, rebetiko, island songs), with 7 local cultural associations performing traditional dances and free local food offered by community groups. Part of the 15th International Festival.',
   false),
  ('municipal-2026-vouprasia-closing',
   'Vouprasia 2026 - Closing Night', 'Βουπρασία 2026 - Βραδιά Λήξης',
   'festival', 'Πλατεία Βάρδας', 'Βάρδα', null, date '2026-06-27',
   'Δήμος Ανδραβίδας-Κυλλήνης',
   'Η τελευταία βραδιά του τετραήμερου πολιτιστικού θεσμού «Βουπρασία 2026», με μεγάλη παράσταση παραδοσιακών και λαϊκών χορών από τα τμήματα του Δημοτικού Ωδείου και πολιτιστικούς συλλόγους της περιοχής.',
   'The closing night of the four-day cultural event ''Vouprasia 2026'', featuring a large traditional and folk dance performance by the Municipal Conservatory''s dance groups and local cultural associations.',
   true),
  ('municipal-2026-anthestiria-gastouni',
   'Anthestiria Gastounis 2026', 'Ανθεστήρια Γαστούνης 2026',
   'festival', 'Πλατεία Ελευθερίας', 'Γαστούνη', 'gastouni', date '2026-05-15',
   'Δήμος Πηνειού',
   'Τριήμερο ανοιξιάτικο πολιτιστικό γεγονός στην πλατεία Ελευθερίας της Γαστούνης, με μουσικές βραδιές, χορό, εκθέσεις ζωγραφικής μαθητών και ελεύθερη συμμετοχή εκατοντάδων πολιτών.',
   'A three-day spring cultural celebration in Gastouni''s central square, featuring music, dance, student art exhibitions, and open participation from hundreds of residents.',
   true),
  ('municipal-2026-traganos-carnival',
   '30th Traganos Carnival Parade', '30ό Τραγανέικο Καρναβάλι',
   'festival', 'Κεντρική πλατεία Τραγανού', 'Τραγανό', null, date '2026-02-22',
   'Δήμος Πηνειού',
   'Καρναβαλική παρέλαση στο Τραγανό, αποκορύφωμα των αποκριάτικων εκδηλώσεων του Δήμου Πηνειού, με τη συμμετοχή γειτονικού Βαρθολομιού.',
   'A carnival parade in Traganos, the highlight of the Municipality of Pineios'' carnival festivities, with neighboring Vartholomio also taking part.',
   true),
  ('municipal-2026-ilida-revue',
   'Ego Tha Sas Ta Po - Comedy Revue', '«Εγώ θα σας τα πω!» - Επιθεώρηση',
   'theater', 'Αρχαίο Θέατρο Ήλιδας', 'Αρχαία Ήλιδα', 'ancient-elis', date '2026-07-21',
   'Δήμος Ήλιδας',
   'Σατιρική επιθεώρηση με κείμενα Γεράσιμου Ευαγγελάτου και Δημήτρη Χαλιώτη, μουσική Θέμη Καραμουρατίδη, στο πλαίσιο του 36ου Φεστιβάλ Αρχαίας Ήλιδας.',
   'A satirical revue with texts by Gerasimos Evangelatos and Dimitris Chaliotis, music by Themis Karamouratidis, part of the 36th Ancient Ilida Festival.',
   true),
  ('municipal-2026-ilida-antigone',
   'Antigone by Sophocles', '«Αντιγόνη» του Σοφοκλή',
   'theater', 'Αρχαίο Θέατρο Ήλιδας', 'Αρχαία Ήλιδα', 'ancient-elis', date '2026-08-01',
   'Δήμος Ήλιδας',
   'Το κλασικό έργο του Σοφοκλή σε σκηνοθεσία Θέμη Μουμουλίδη, στο πλαίσιο του 36ου Φεστιβάλ Αρχαίας Ήλιδας.',
   'Sophocles'' classic tragedy, directed by Themis Moumoulidis, part of the 36th Ancient Ilida Festival.',
   true),
  ('municipal-2026-ilida-full-moon',
   'A Journey in the Light of the Full Moon', '«Ταξίδι στο Φως της Πανσελήνου»',
   'concert', 'Αίθριο Νέου Μουσείου Ήλιδας', 'Αρχαία Ήλιδα', 'ancient-elis', date '2026-08-28',
   'Δήμος Ήλιδας',
   'Ρεσιτάλ πιάνου και φωνής με τους Χρήστο Τσατσάμπα και Χριστίνα Τσιμπρή, στο πλαίσιο του 36ου Φεστιβάλ Αρχαίας Ήλιδας.',
   'A piano and voice recital by Christos Tsatsampas and Christina Tsimpri, part of the 36th Ancient Ilida Festival.',
   false)
) as v(id, title, greek_title, event_type, venue_name, area, place_id, event_day,
       organizer_name, description_el, description_en, is_past_event)
join public.organizers o on o.display_name = v.organizer_name
left join public.places p on p.id = v.place_id::text
on conflict (id) do nothing;

commit;
