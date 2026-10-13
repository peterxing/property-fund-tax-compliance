// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { Holder } from "../types.ts";

export const HOLDERS: Holder[] = [
  // harbourline
  { id: "h-hl-1", fundId: "harbourline", holder: "Australian resident unitholders (retail register)", country: "Australia", units: 902151600, auStatus: "resident" },
  { id: "h-hl-2", fundId: "harbourline", holder: "Banksia Super Fund", country: "Australia", units: 141268000, auStatus: "resident" },
  { id: "h-hl-3", fundId: "harbourline", holder: "Sakuragawa Life Assurance", country: "Japan", units: 211902000, auStatus: "foreign-eoi" },
  { id: "h-hl-4", fundId: "harbourline", holder: "Nordfjell Sovereign Holdings", country: "Norway", units: 141268000, auStatus: "foreign-eoi" },
  { id: "h-hl-5", fundId: "harbourline", holder: "Offshore nominee account", country: "Non-EOI address", units: 16090400, auStatus: "foreign-non-eoi" },

  // southbank
  { id: "h-sb-1", fundId: "southbank", holder: "Banksia Super Fund", country: "Australia", units: 205264500, auStatus: "resident" },
  { id: "h-sb-2", fundId: "southbank", holder: "Eucalypt Industry Super", country: "Australia", units: 136843000, auStatus: "resident" },
  { id: "h-sb-3", fundId: "southbank", holder: "Kestrel Pension Plan", country: "Canada", units: 171053750, auStatus: "foreign-eoi" },
  { id: "h-sb-4", fundId: "southbank", holder: "Serangoon Capital Pte Ltd", country: "Singapore", units: 171053750, auStatus: "foreign-eoi" },

  // wattle
  { id: "h-wt-1", fundId: "wattle", holder: "Australian resident unitholders (retail register)", country: "Australia", units: 1515837600, auStatus: "resident" },
  { id: "h-wt-2", fundId: "wattle", holder: "Eucalypt Industry Super", country: "Australia", units: 252639600, auStatus: "resident" },
  { id: "h-wt-3", fundId: "wattle", holder: "Nordfjell Sovereign Holdings", country: "Norway", units: 210533000, auStatus: "foreign-eoi" },
  { id: "h-wt-4", fundId: "wattle", holder: "Sakuragawa Life Assurance", country: "Japan", units: 126319800, auStatus: "foreign-eoi" },

  // kurrajong
  { id: "h-kj-1", fundId: "kurrajong", holder: "Australian resident unitholders (retail register)", country: "Australia", units: 570840000, auStatus: "resident" },
  { id: "h-kj-2", fundId: "kurrajong", holder: "Eucalypt Industry Super", country: "Australia", units: 95140000, auStatus: "resident" },
  { id: "h-kj-3", fundId: "kurrajong", holder: "Serangoon Capital Pte Ltd", country: "Singapore", units: 142710000, auStatus: "foreign-eoi" },
  { id: "h-kj-4", fundId: "kurrajong", holder: "Kestrel Pension Plan", country: "Canada", units: 95140000, auStatus: "foreign-eoi" },
  { id: "h-kj-5", fundId: "kurrajong", holder: "Offshore nominee account", country: "Non-EOI address", units: 46320000, auStatus: "foreign-non-eoi" },

  // coastline
  { id: "h-cl-1", fundId: "coastline", holder: "Australian resident unitholders (retail register)", country: "Australia", units: 191364000, auStatus: "resident" },
  { id: "h-cl-2", fundId: "coastline", holder: "Banksia Super Fund", country: "Australia", units: 63788000, auStatus: "resident" },
  { id: "h-cl-3", fundId: "coastline", holder: "Kestrel Pension Plan", country: "Canada", units: 47841000, auStatus: "foreign-eoi" },
  { id: "h-cl-4", fundId: "coastline", holder: "Offshore nominee account", country: "Non-EOI address", units: 15947000, auStatus: "foreign-non-eoi" },

  // telok-ayer
  { id: "h-ta-1", fundId: "telok-ayer", holder: "Individual unitholders (CDP, SRS & CPFIS)", country: "Various", units: 1694472000, sgClass: "individual" },
  { id: "h-ta-2", fundId: "telok-ayer", holder: "Singapore resident companies", country: "Singapore", units: 1059045000, sgClass: "qualifying" },
  { id: "h-ta-3", fundId: "telok-ayer", holder: "Oriole Assurance Pte Ltd", country: "Singapore", units: 423618000, sgClass: "qualifying" },
  { id: "h-ta-4", fundId: "telok-ayer", holder: "Sakuragawa Life Assurance", country: "Japan", units: 635427000, sgClass: "nrni" },
  { id: "h-ta-5", fundId: "telok-ayer", holder: "Nominee accounts without a declaration", country: "Various", units: 423618000, sgClass: "other" },

  // loyang
  { id: "h-ly-1", fundId: "loyang", holder: "Individual unitholders (CDP, SRS & CPFIS)", country: "Various", units: 1004867500, sgClass: "individual" },
  { id: "h-ly-2", fundId: "loyang", holder: "Singapore resident companies", country: "Singapore", units: 717762500, sgClass: "qualifying" },
  { id: "h-ly-3", fundId: "loyang", holder: "Kestrel Pension Plan", country: "Canada", units: 574210000, sgClass: "nrni" },
  { id: "h-ly-4", fundId: "loyang", holder: "Lumen Asia Real Assets Fund", country: "Cayman Islands", units: 430657500, sgClass: "nr-fund" },
  { id: "h-ly-5", fundId: "loyang", holder: "Nordfjell Sovereign Holdings", country: "Norway", units: 143552500, sgClass: "nrni" },

  // meranti
  { id: "h-mr-1", fundId: "meranti", holder: "Individual unitholders (CDP, SRS & CPFIS)", country: "Various", units: 476676000, sgClass: "individual" },
  { id: "h-mr-2", fundId: "meranti", holder: "Singapore resident companies", country: "Singapore", units: 317784000, sgClass: "qualifying" },
  { id: "h-mr-3", fundId: "meranti", holder: "Lumen Asia Real Assets Fund", country: "Cayman Islands", units: 397230000, sgClass: "nr-fund" },
  { id: "h-mr-4", fundId: "meranti", holder: "Sakuragawa Life Assurance", country: "Japan", units: 238338000, sgClass: "nrni" },
  { id: "h-mr-5", fundId: "meranti", holder: "Nominee accounts without a declaration", country: "Various", units: 158892000, sgClass: "other" },

  // kallang
  { id: "h-kr-1", fundId: "kallang", holder: "Individual unitholders (CDP, SRS & CPFIS)", country: "Various", units: 1701380000, sgClass: "individual" },
  { id: "h-kr-2", fundId: "kallang", holder: "Singapore resident companies", country: "Singapore", units: 680552000, sgClass: "qualifying" },
  { id: "h-kr-3", fundId: "kallang", holder: "Oriole Assurance Pte Ltd", country: "Singapore", units: 340276000, sgClass: "qualifying" },
  { id: "h-kr-4", fundId: "kallang", holder: "Nordfjell Sovereign Holdings", country: "Norway", units: 510414000, sgClass: "nrni" },
  { id: "h-kr-5", fundId: "kallang", holder: "Nominee accounts without a declaration", country: "Various", units: 170138000, sgClass: "other" },
];
