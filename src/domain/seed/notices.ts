// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { AuNotice, SgNotice } from "../types.ts";

export const AU_NOTICES: AuNotice[] = [
  // harbourline
  { id: "harbourline-2025-09-30", fundId: "harbourline", label: "Quarter ended 30 Sep 2025", recordDate: "2025-09-30", paymentDate: "2025-11-14", cash: 2260400000, final: false, publishedOn: "2025-11-07", notified: { other: 1372739556, ncmi: 0, excludedNcmi: 0, clean: 151725982, interest: 28972026 } },
  { id: "harbourline-2025-12-31", fundId: "harbourline", label: "Quarter ended 31 Dec 2025", recordDate: "2025-12-31", paymentDate: "2026-02-13", cash: 2288700000, final: false, publishedOn: "2026-02-06", notified: { other: 1389926129, ncmi: 0, excludedNcmi: 0, clean: 153625577, interest: 29334754 } },
  { id: "harbourline-2026-03-31", fundId: "harbourline", label: "Quarter ended 31 Mar 2026", recordDate: "2026-03-31", paymentDate: "2026-05-15", cash: 2304100000, final: false, publishedOn: "2026-05-08", notified: { other: 1399278539, ncmi: 0, excludedNcmi: 0, clean: 154659279, interest: 29532139 } },
  { id: "harbourline-2026-06-30", fundId: "harbourline", label: "Quarter ended 30 Jun 2026", recordDate: "2026-06-30", paymentDate: "2026-08-28", cash: 2391400000, final: true, publishedOn: "2026-08-21", notified: { other: 1452295776, ncmi: 0, excludedNcmi: 0, clean: 160519162, interest: 30651081 } },

  // southbank
  { id: "southbank-2025-12-31", fundId: "southbank", label: "Half-year ended 31 Dec 2025", recordDate: "2025-12-31", paymentDate: "2026-02-27", cash: 2312000000, final: false, publishedOn: "2026-02-20", notified: { other: 1560509404, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 19716054 } },
  { id: "southbank-2026-06-30", fundId: "southbank", label: "Half-year ended 30 Jun 2026", recordDate: "2026-06-30", paymentDate: "2026-08-28", cash: 2409200000, final: true, publishedOn: "2026-08-20", notified: { other: 1626115596, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 20544946 } },

  // wattle
  { id: "wattle-2025-09-30", fundId: "wattle", label: "Quarter ended 30 Sep 2025", recordDate: "2025-09-30", paymentDate: "2025-11-14", cash: 3184000000, final: false, publishedOn: "2025-11-07", notified: { other: 2757488656, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 72224810 } },
  { id: "wattle-2025-12-31", fundId: "wattle", label: "Quarter ended 31 Dec 2025", recordDate: "2025-12-31", paymentDate: "2026-02-13", cash: 3211500000, final: false, publishedOn: "2026-02-06", notified: { other: 2781304905, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 72848611 } },
  { id: "wattle-2026-03-31", fundId: "wattle", label: "Quarter ended 31 Mar 2026", recordDate: "2026-03-31", paymentDate: "2026-05-15", cash: 3240200000, final: false, publishedOn: "2026-05-08", notified: { other: 2806160409, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 73499633 } },
  { id: "wattle-2026-06-30", fundId: "wattle", label: "Quarter ended 30 Jun 2026", recordDate: "2026-06-30", paymentDate: "2026-08-28", cash: 3333100000, final: true, publishedOn: "2026-08-21", notified: { other: 2886616030, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 75606946 } },

  // kurrajong
  { id: "kurrajong-2025-09-30", fundId: "kurrajong", label: "Quarter ended 30 Sep 2025", recordDate: "2025-09-30", paymentDate: "2025-11-14", cash: 1440200000, final: false, publishedOn: "2025-11-07", notified: { other: 750526446, ncmi: 0, excludedNcmi: 238622151, clean: 0, interest: 12852016 } },
  { id: "kurrajong-2025-12-31", fundId: "kurrajong", label: "Quarter ended 31 Dec 2025", recordDate: "2025-12-31", paymentDate: "2026-02-13", cash: 1448800000, final: false, publishedOn: "2026-02-06", notified: { other: 755008134, ncmi: 0, excludedNcmi: 240047058, clean: 0, interest: 12928760 } },
  { id: "kurrajong-2026-03-31", fundId: "kurrajong", label: "Quarter ended 31 Mar 2026", recordDate: "2026-03-31", paymentDate: "2026-05-15", cash: 1451900000, final: false, publishedOn: "2026-05-08", notified: { other: 756623627, ncmi: 0, excludedNcmi: 240560687, clean: 0, interest: 12956424 } },
  { id: "kurrajong-2026-06-30", fundId: "kurrajong", label: "Quarter ended 30 Jun 2026", recordDate: "2026-06-30", paymentDate: "2026-08-28", cash: 1462700000, final: true, publishedOn: "2026-08-21", notified: { other: 762251793, ncmi: 0, excludedNcmi: 242350104, clean: 0, interest: 13052800 } },

  // coastline
  { id: "coastline-2025-12-31", fundId: "coastline", label: "Quarter ended 31 Dec 2025", recordDate: "2025-12-31", paymentDate: "2026-02-13", cash: 518000000, final: false, publishedOn: "2026-02-06", notified: { other: 417649805, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 5224791 } },
  { id: "coastline-2026-03-31", fundId: "coastline", label: "Quarter ended 31 Mar 2026", recordDate: "2026-03-31", paymentDate: "2026-05-15", cash: 521400000, final: false, publishedOn: "2026-05-08", notified: { other: 420391136, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 5259085 } },
  { id: "coastline-2026-06-30", fundId: "coastline", label: "Quarter ended 30 Jun 2026", recordDate: "2026-06-30", paymentDate: "2026-08-14", cash: 529000000, final: false, publishedOn: "2026-08-07", notified: { other: 426518817, ncmi: 0, excludedNcmi: 0, clean: 0, interest: 5335742 } },
  { id: "coastline-2026-09-30", fundId: "coastline", label: "Quarter ended 30 Sep 2026", recordDate: "2026-09-30", paymentDate: "2026-11-13", cash: 536400000, final: true, publishedOn: null, notified: null },
];

export const SG_NOTICES: SgNotice[] = [
  { id: "telok-ayer-notice", fundId: "telok-ayer", recordDate: "2026-11-06", declarationDeadline: "2026-11-13", paymentDate: "2026-11-27", publishedOn: null, notified: null },
  { id: "loyang-notice", fundId: "loyang", recordDate: "2026-08-07", declarationDeadline: "2026-08-14", paymentDate: "2026-08-28", publishedOn: "2026-07-30", notified: { taxable: 6981610000, exempt: 0, capital: 430200000 } },
  { id: "meranti-notice", fundId: "meranti", recordDate: "2026-11-05", declarationDeadline: "2026-11-12", paymentDate: "2026-11-26", publishedOn: null, notified: null },
  { id: "kallang-notice", fundId: "kallang", recordDate: "2026-11-09", declarationDeadline: "2026-11-16", paymentDate: "2026-11-30", publishedOn: null, notified: null },
];
