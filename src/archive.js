/**
 * Archive records for the lore cards: dates, typology, restoration notes and Inspector hotspots.
 * Hotspot x/y are in the elevation drawing's units (viewBox 0 0 200 150, see art.jsx).
 * `spoiler` items stay hidden until the monument's riddle is solved.
 */

/** Nepal Sambat began in autumn 879 CE, so one CE year spans two NS years. */
export function nepalSambat(ce) {
  if (ce == null) return null;
  if (ce < 879) return 'Before Nepal Sambat (began 879 CE)';
  return `NS ${ce - 879}–${ce - 878}`;
}

export const ARCHIVE = {
  LAL1340: {
    built: { ce: 1637, label: '1637 CE' },
    typology: 'Stone Shikhara temple',
    restoration: 'Came through the 2015 earthquake largely intact.',
    inspector: [
      { id: 'frieze1', label: 'Mahabharata frieze', x: 100, y: 95, text: 'The first-floor beam carries stone reliefs of scenes from the Mahabharata, each with a short caption in old Newari.' },
      { id: 'frieze2', label: 'Ramayana frieze', x: 100, y: 69, text: 'The second-floor frieze tells the Ramayana in the same way, panel by panel.' },
      { id: 'spire', label: 'Central shikhara', x: 100, y: 38, text: 'A tall curved stone spire rises over the sanctum, with smaller spired pavilions clustered around it.' },
      { id: 'garuda', label: 'Garuda pillar', x: 178, y: 90, text: 'A kneeling Garuda, Vishnu’s mount, faces the temple from the top of a stone pillar east of the steps.' },
    ],
  },
  LAL1350: {
    built: { ce: 1627, label: '1627 CE' },
    typology: 'Newa pagoda · 2 tiers',
    restoration: 'Partly collapsed in the 1990 monsoon and rebuilt; damaged again in 2015 and restored.',
    inspector: [
      { id: 'guardians', label: 'Guardians at the steps', x: 78, y: 116, spoiler: true, text: 'Two monolithic stone elephants, each with a rider, guard the western entrance steps.' },
      { id: 'torana', label: 'Torana over the door', x: 100, y: 95, text: 'A carved and gilded arch (torana) over the door shows the temple’s deity, here Shiva.' },
      { id: 'struts', label: 'Carved roof struts', x: 66, y: 80, text: 'Wooden struts hold the wide eaves. Each is carved with a deity standing over smaller figures.' },
    ],
  },
  LAL1380: {
    built: { ce: null, label: '17th century' },
    typology: 'Newa pagoda · 3 tiers',
    restoration: 'Rebuilt several times after fire and earthquake, including after 1934.',
    inspector: [
      { id: 'tiers', label: 'Three roofs', x: 100, y: 38, text: 'Three tiers of tiled roof step in toward a gilded pinnacle.' },
      { id: 'torana', label: 'Gilded front', x: 100, y: 95, text: 'The front carries gilded metalwork, paid for by the merchants who worship Bhimsen as the god of trade.' },
      { id: 'struts', label: 'Roof struts', x: 66, y: 80, text: 'Carved struts under each roof hold up the eaves.' },
    ],
  },
  LAL1320: {
    built: { ce: 1566, label: '1566 CE' },
    typology: 'Newa pagoda · 2 tiers',
    restoration: null,
    inspector: [
      { id: 'struts', label: 'Avatar struts', x: 66, y: 80, text: 'The roof struts show Vishnu’s avatars, with small erotic scenes carved below them, common on Newar temples.' },
      { id: 'lions', label: 'Stone lions', x: 78, y: 116, text: 'A pair of stone lions guards the plinth.' },
      { id: 'torana', label: 'Torana', x: 100, y: 95, text: 'The arch over the door shows Narayan (Vishnu).' },
    ],
  },
  LAL1330: {
    built: { ce: 1734, label: 'Completed 1734 CE' },
    typology: 'Royal courtyard (chowk) of the Malla palace',
    restoration: 'Restored in the 1990s with Austrian support; the Patan Museum opened here in 1997.',
    inspector: [
      { id: 'door', label: 'Golden Door (Sun Dhoka)', x: 100, y: 120, text: 'The gilded doorway from the square into the courtyard, framed with deities in repoussé metalwork.' },
      { id: 'window', label: 'Golden Window', x: 100, y: 66, text: 'The gilded window above the door, where the king could look out over the square.' },
      { id: 'lattice', label: 'Lattice windows', x: 25, y: 66, text: 'Carved wooden lattice windows (tiki jhyal) let people inside see out without being seen.' },
    ],
  },
  LAL1270: {
    built: { ce: 1640, label: '1640 CE' },
    typology: 'Newa pagoda temple of the royal goddess',
    restoration: 'Rebuilt after the 1934 earthquake brought it down.',
    inspector: [
      { id: 'tiers', label: 'Tiered roofs', x: 100, y: 38, text: 'The roofs rise high over the palace wing, so the goddess’s temple can be seen across the square.' },
      { id: 'struts', label: 'Roof struts', x: 66, y: 80, text: 'Carved struts under the eaves.' },
      { id: 'torana', label: 'Sanctum door', x: 100, y: 95, text: 'The sanctum is reserved for its priests. Players stay outside, at the viewpoint.' },
    ],
  },
  LAL1260: {
    built: { ce: null, label: '1660s CE' },
    typology: 'Royal ritual courtyard (chowk)',
    restoration: null,
    inspector: [
      { id: 'ganga', label: 'Ganga on a makara', x: 74, y: 128, text: 'A bronze of the river goddess Ganga standing on a makara, the crocodile-like water creature.' },
      { id: 'yamuna', label: 'Yamuna on a tortoise', x: 126, y: 128, text: 'Her sister Yamuna stands on a tortoise on the other side of the door.' },
      { id: 'door', label: 'Golden door to Taleju', x: 100, y: 120, text: 'The gilded door between them leads to the shrine of Taleju, the royal goddess.' },
    ],
  },
  LAL1220: {
    built: { ce: 1647, label: '1647 CE' },
    typology: 'Royal courtyard with a sunken bath (hiti)',
    restoration: null,
    inspector: [
      { id: 'spout', label: 'Gilded spout', x: 140, y: 104, text: 'Water runs into Tusa Hiti from a gilded spout.' },
      { id: 'steps', label: 'Steps down', x: 40, y: 100, text: 'Steps lead down into the bath, below the courtyard floor. The game checks that you went down with the barometer.' },
      { id: 'niches', label: 'Carved deities', x: 172, y: 76, text: 'Carved stone deities line the walls of the bath.' },
    ],
  },
  LAL1360: {
    built: { ce: 570, label: '570 CE' },
    typology: 'Sunken stone water spout (hiti / dhunge dhara)',
    restoration: 'Still in daily use.',
    inspector: [
      { id: 'spouts', label: 'Three makara spouts', x: 140, y: 104, text: 'Three stone spouts carved as makaras pour water into the basin.' },
      { id: 'depth', label: '−3 m below the street', x: 30, y: 92, text: 'The basin sits about 3 m below the street, close to the water table. That is why the game asks for +0.30 hPa.' },
      { id: 'mandap', label: 'Mani Mandap', x: 175, y: 42, text: 'A pair of open pavilions beside the spout, built around 1700 for royal ceremonies.' },
    ],
  },
  boudha: {
    built: { ce: null, label: 'c. 5th–6th century CE; rebuilt many times' },
    typology: 'Stupa',
    restoration: 'Spire taken down after the 2015 earthquake, rebuilt, and reopened in November 2016.',
    inspector: [
      { id: 'eyes', label: 'Eyes of the Buddha', x: 100, y: 64, text: 'Painted eyes on the harmika look out in all four directions.' },
      { id: 'tiers', label: 'Thirteen tiers', x: 100, y: 34, text: 'The thirteen gilded steps of the spire stand for the stages to enlightenment.' },
      { id: 'wheels', label: 'Prayer wheels', x: 60, y: 128, text: 'Prayer wheels line the base. Pilgrims turn them as they walk the kora clockwise.' },
    ],
  },
};
