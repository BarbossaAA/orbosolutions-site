/*
 * TERRA — data.js
 * Editorial content for the five field studies.
 * `report` feeds the full-screen field-report dossier:
 * three count-up stats, a closing quote and the contour
 * interval printed under the topographic mini-map.
 */

export const PROJECTS = [
  {
    id: 'dune',
    no: '01',
    name: 'Dune',
    lines: ['Erg Chebbi', 'Drift Atlas'],
    year: '2021',
    coords: '31.15°N — 4.01°W',
    medium: 'Aerial LiDAR',
    desc: 'Fourteen months tracking the slow migration of star dunes across the Moroccan erg — sand read as an archive of wind.',
    accent: '#C89B5E',
    report: {
      interval: '8 m',
      stats: [
        { label: 'Survey window', value: 14, suffix: 'months' },
        { label: 'Crest migration', value: 18.4, dec: 1, suffix: 'm / yr' },
        { label: 'Maximum relief', value: 158, suffix: 'm' }
      ],
      quote: 'A dune is not a form. It is sand caught in the act of remembering the wind.',
      cite: 'Field notebook — day 212'
    }
  },
  {
    id: 'moss',
    no: '02',
    name: 'Moss',
    lines: ['Boreal', 'Understory Index'],
    year: '2022',
    coords: '66.33°N — 29.54°E',
    medium: 'Multispectral survey',
    desc: 'A canopy-down census of moss and lichen cover in old-growth taiga, mapped one hectare at a time.',
    accent: '#8FA36A',
    report: {
      interval: '2 m',
      stats: [
        { label: 'Hectares indexed', value: 212, suffix: 'ha' },
        { label: 'Species recorded', value: 74, suffix: 'spp.' },
        { label: 'Ground cover', value: 91, suffix: '%' }
      ],
      quote: 'Every hectare here is an argument that slowness can still win ground.',
      cite: 'Survey log — Kuusamo station'
    }
  },
  {
    id: 'clay',
    no: '03',
    name: 'Clay',
    lines: ['Painted Hills', 'Strata Record'],
    year: '2023',
    coords: '44.66°N — 120.27°W',
    medium: 'Stratigraphic imaging',
    desc: 'Thirty-three million years of climate written in banded laterite, read from six hundred feet above the Oregon high desert.',
    accent: '#C4744A',
    report: {
      interval: '5 m',
      stats: [
        { label: 'Record span', value: 33, suffix: 'M yr' },
        { label: 'Beds logged', value: 47, suffix: 'beds' },
        { label: 'Section height', value: 192, suffix: 'm' }
      ],
      quote: 'Climate is a rumour on the surface. The hills wrote it down and kept the ledger.',
      cite: 'Strata Record — plate 09'
    }
  },
  {
    id: 'glacier',
    no: '04',
    name: 'Glacier',
    lines: ['Vatnajökull', 'Melt Ledger'],
    year: '2024',
    coords: '64.42°N — 16.80°W',
    medium: 'Radar altimetry',
    desc: 'An annual accounting of Europe’s largest ice cap, where every survey line returns thinner than the last.',
    accent: '#9FC2D2',
    report: {
      interval: '25 m',
      stats: [
        { label: 'Survey lines flown', value: 62, suffix: 'lines' },
        { label: 'Mean thinning', value: 1.9, dec: 1, suffix: 'm / yr' },
        { label: 'Ice cap area', value: 7700, suffix: 'km²' }
      ],
      quote: 'The ledger balances every spring. It is the ice that pays.',
      cite: 'Melt Ledger — 2024 audit'
    }
  },
  {
    id: 'basalt',
    no: '05',
    name: 'Basalt',
    lines: ['Stúðlagil', 'Column Field'],
    year: '2025',
    coords: '65.16°N — 15.30°W',
    medium: 'Photogrammetry',
    desc: 'Hexagonal jointing in a drained river canyon: geometry the earth arrived at without instruction.',
    accent: '#A19A8F',
    report: {
      interval: '3 m',
      stats: [
        { label: 'Columns mapped', value: 1142, suffix: 'cols' },
        { label: 'Mean face count', value: 5.9, dec: 1, suffix: 'faces' },
        { label: 'Tallest column', value: 24, suffix: 'm' }
      ],
      quote: 'No one taught the rock geometry. It cooled, and geometry was what remained.',
      cite: 'Column Field — closing note'
    }
  }
];
