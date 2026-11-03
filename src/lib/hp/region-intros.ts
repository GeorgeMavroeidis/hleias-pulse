// One-line "what is this area" for the map's region sheet, keyed by the area id
// in area-catalog.ts. Standalone (solo-*) areas have no intro and show none.
//
// DRAFT COPY (2026-11-01): written from general, well-known facts only and NOT
// yet checked by someone local. `reviewed: false` makes the sheet show a small
// "to be checked" tag next to the line, so an unchecked sentence can never pass
// for a confirmed one. Flip `reviewed` only after a local has read it.

export type RegionIntro = { GR: string; EN: string; reviewed: boolean };

export const REGION_INTROS: Record<string, RegionIntro> = {
  olympia: {
    GR: "Το ιερό του Δία και η γενέτειρα των Ολυμπιακών Αγώνων, με το στάδιο και δύο μουσεία σε απόσταση με τα πόδια.",
    EN: "The sanctuary of Zeus and birthplace of the Olympic Games, with the stadium and two museums within walking distance.",
    reviewed: false,
  },
  "ancient-elis": {
    GR: "Η αρχαία πόλη που οργάνωνε τους Ολυμπιακούς Αγώνες· ήσυχος αρχαιολογικός χώρος με θέατρο και αγορά.",
    EN: "The ancient city that ran the Olympic Games; a quiet site with a theatre and an agora.",
    reviewed: false,
  },
  katakolo: {
    GR: "Μικρό λιμάνι όπου πιάνουν τα κρουαζιερόπλοια, με ταβέρνες πάνω στο νερό και ωραίο ηλιοβασίλεμα.",
    EN: "A small harbour where cruise ships call, with waterside tavernas and a good sunset.",
    reviewed: false,
  },
  skafidia: {
    GR: "Ήσυχη ακτή κοντά στον Πύργο, με ένα παλιό μοναστήρι δίπλα στη θάλασσα και οινοποιείο στην ενδοχώρα.",
    EN: "A quiet stretch of coast near Pyrgos, with an old seaside monastery and a winery inland.",
    reviewed: false,
  },
  kourouta: {
    GR: "Μεγάλη αμμουδιά κοντά στην Αμαλιάδα με beach bars· γεμίζει κόσμο τα καλοκαιρινά βράδια.",
    EN: "A long sandy beach near Amaliada with beach bars; busy on summer evenings.",
    reviewed: false,
  },
  kyllini: {
    GR: "Το λιμάνι για τα πλοία προς Ζάκυνθο και Κεφαλονιά, με παραλίες λίγα λεπτά μακριά.",
    EN: "The port for ferries to Zakynthos and Kefalonia, with beaches a few minutes away.",
    reviewed: false,
  },
  chlemoutsi: {
    GR: "Φράγκικο κάστρο του 13ου αιώνα πάνω από τη θάλασσα, κοντά στα Λουτρά Κυλλήνης και την Αρκούδι.",
    EN: "A 13th-century Frankish castle above the sea, close to Loutra Kyllinis and Arkoudi beach.",
    reviewed: false,
  },
  pyrgos: {
    GR: "Η πρωτεύουσα του νομού: πλατείες, καφέ, μαγαζιά και η βραδινή έξοδος των ντόπιων.",
    EN: "The capital of the prefecture: squares, cafés, shops and where locals go out at night.",
    reviewed: false,
  },
  pineios: {
    GR: "Ο κάμπος του Πηνειού: αγροτικές κωμοπόλεις όπως η Γαστούνη και το Βαρθολομιό, με τοπικό φαγητό.",
    EN: "The Pineios plain: farming towns such as Gastouni and Vartholomio, with local food.",
    reviewed: false,
  },
  zacharo: {
    GR: "Ατελείωτη παραλία με αμμόλοφους και πευκοδάσος, δίπλα στη λίμνη Καϊάφα και τις ιαματικές πηγές της.",
    EN: "An endless beach with dunes and pine forest, next to Lake Kaiafas and its thermal springs.",
    reviewed: false,
  },
  kakovatos: {
    GR: "Φαρδιά αμμουδιά, πιο ήσυχη από τις πολυσύχναστες παραλίες της περιοχής.",
    EN: "A wide sandy beach, quieter than the area's busier ones.",
    reviewed: false,
  },
  "south-coast": {
    GR: "Οι ήσυχες παραλίες στη νότια άκρη της Ηλείας, κοντά στα σύνορα με τη Μεσσηνία.",
    EN: "The quiet beaches at the southern tip of Ilia, near the border with Messinia.",
    reviewed: false,
  },
  foloi: {
    GR: "Μεγάλο δάσος βελανιδιάς σε οροπέδιο πάνω από την Ολυμπία· δροσιά και περίπατοι το καλοκαίρι.",
    EN: "A large oak forest on a plateau above Olympia; shade and walks in summer.",
    reviewed: false,
  },
  nemouta: {
    GR: "Ορεινό χωριό με καταρράκτες και κρύα νερά, για μια δροσερή μέρα μακριά από την ακτή.",
    EN: "A mountain village with waterfalls and cold streams, for a cool day away from the coast.",
    reviewed: false,
  },
  andritsaina: {
    GR: "Παραδοσιακό πέτρινο ορεινό χωριό και η βάση για την επίσκεψη στον ναό των Βασσών.",
    EN: "A traditional stone mountain village and the base for visiting the Temple of Bassae.",
    reviewed: false,
  },
  bassae: {
    GR: "Ο ναός του Επικούρειου Απόλλωνα, μνημείο της UNESCO, ψηλά στα βουνά κάτω από προστατευτικό στέγαστρο.",
    EN: "The Temple of Apollo Epikourios, a UNESCO site high in the mountains under a protective canopy.",
    reviewed: false,
  },
};

export function regionIntro(regionId: string, language: "GR" | "EN") {
  const intro = REGION_INTROS[regionId];
  return intro ? { text: intro[language], reviewed: intro.reviewed } : null;
}
