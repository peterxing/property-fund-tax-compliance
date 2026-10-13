// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { Property } from "../types.ts";

export const PROPERTIES: Property[] = [
  // harbourline
  { id: "harbourline-harbourline-tower", fundId: "harbourline", name: "Harbourline Tower", location: "210 Kent Street, Sydney NSW", acquired: "2014-03-18", cost: 57162520000, improvements: 4630164100, capitalWorksClaimed: 8117077800, valuation: 78366385200 },
  { id: "harbourline-riverside-place", fundId: "harbourline", name: "Riverside Place", location: "71 Eagle Street, Brisbane QLD", acquired: "2017-08-01", cost: 50015043100, improvements: 3200962800, capitalWorksClaimed: 5901775100, valuation: 40690238500 },
  { id: "harbourline-collins-quarter", fundId: "harbourline", name: "Collins Quarter", location: "455 Collins Street, Melbourne VIC", acquired: "2026-02-20", cost: 30614420300, improvements: 0, capitalWorksClaimed: 183686500, valuation: 31647963200 },

  // southbank
  { id: "southbank-dandenong-south-estate", fundId: "southbank", name: "Dandenong South Estate", location: "Dandenong South VIC", acquired: "2015-06-30", cost: 18917038400, improvements: 983686000, capitalWorksClaimed: 3045643200, valuation: 31687552600 },
  { id: "southbank-port-botany-distribution-centre", fundId: "southbank", name: "Port Botany Distribution Centre", location: "Banksmeadow NSW", acquired: "2018-11-12", cost: 17805585200, improvements: 658806700, capitalWorksClaimed: 1727141800, valuation: 26277482700 },
  { id: "southbank-eastern-creek-logistics-hub", fundId: "southbank", name: "Eastern Creek Logistics Hub", location: "Eastern Creek NSW", acquired: "2021-04-09", cost: 16755854500, improvements: 184314400, capitalWorksClaimed: 971839600, valuation: 19321678400 },

  // wattle
  { id: "wattle-wattle-grove-shopping-centre", fundId: "wattle", name: "Wattle Grove Shopping Centre", location: "Wattle Grove NSW", acquired: "2009-10-01", cost: 65649803100, improvements: 9322272000, capitalWorksClaimed: 14114707700, valuation: 71811693600 },
  { id: "wattle-lakeside-marketplace", fundId: "wattle", name: "Lakeside Marketplace", location: "Mawson Lakes SA", acquired: "2012-05-21", cost: 64838184700, improvements: 6354142100, capitalWorksClaimed: 11411520500, valuation: 55596149900 },
  { id: "wattle-coral-coast-central", fundId: "wattle", name: "Coral Coast Central", location: "Townsville QLD", acquired: "2016-02-15", cost: 67905579500, improvements: 4821296100, capitalWorksClaimed: 8216575100, valuation: 50963137400 },
  { id: "wattle-banksia-plaza", fundId: "wattle", name: "Banksia Plaza", location: "Joondalup WA", acquired: "2019-09-30", cost: 52249287500, improvements: 1776475800, capitalWorksClaimed: 3761948700, valuation: 53279643500 },

  // kurrajong
  { id: "kurrajong-kurrajong-business-park", fundId: "kurrajong", name: "Kurrajong Business Park", location: "Macquarie Park NSW", acquired: "2013-07-01", cost: 33887443900, improvements: 3083757400, capitalWorksClaimed: 5693090600, valuation: 47542728200 },
  { id: "kurrajong-ironbark-data-hall", fundId: "kurrajong", name: "Ironbark Data Hall", location: "Clayton VIC", acquired: "2016-12-05", cost: 18846196400, improvements: 2299236000, capitalWorksClaimed: 1960004400, valuation: 32039664600 },
  { id: "kurrajong-fremantle-wharf-offices", fundId: "kurrajong", name: "Fremantle Wharf Offices", location: "Fremantle WA", acquired: "2020-03-02", cost: 27353275500, improvements: 492359000, capitalWorksClaimed: 1723256400, valuation: 23771364100 },

  // coastline
  { id: "coastline-coastline-private-hospital", fundId: "coastline", name: "Coastline Private Hospital", location: "Robina QLD", acquired: "2018-01-29", cost: 15961177100, improvements: 1053437700, capitalWorksClaimed: 1739768300, valuation: 20773791300 },
  { id: "coastline-bayside-medical-centre", fundId: "coastline", name: "Bayside Medical Centre", location: "Frankston VIC", acquired: "2020-08-17", cost: 11470641900, improvements: 275295400, capitalWorksClaimed: 768533000, valuation: 12294692800 },
  { id: "coastline-northern-beaches-day-surgery", fundId: "coastline", name: "Northern Beaches Day Surgery", location: "Brookvale NSW", acquired: "2025-11-03", cost: 9318528500, improvements: 0, capitalWorksClaimed: 83866800, valuation: 9327008300 },

  // telok-ayer
  { id: "telok-ayer-telok-ayer-tower", fundId: "telok-ayer", name: "Telok Ayer Tower", location: "Telok Ayer Street", acquired: "2011-05-16", cost: 217876351200, improvements: 15469220900, capitalWorksClaimed: 0, valuation: 305682699400 },
  { id: "telok-ayer-cecil-exchange", fundId: "telok-ayer", name: "Cecil Exchange", location: "Cecil Street", acquired: "2015-09-01", cost: 165905274500, improvements: 7133926800, capitalWorksClaimed: 0, valuation: 188612729400 },
  { id: "telok-ayer-bugis-gateway-mall", fundId: "telok-ayer", name: "Bugis Gateway Mall", location: "Victoria Street", acquired: "2018-03-12", cost: 161533750100, improvements: 4522945000, capitalWorksClaimed: 0, valuation: 156093293400 },

  // loyang
  { id: "loyang-loyang-logistics-hub", fundId: "loyang", name: "Loyang Logistics Hub", location: "Loyang Crescent", acquired: "2012-02-20", cost: 162709371300, improvements: 9925271600, capitalWorksClaimed: 0, valuation: 248593885800 },
  { id: "loyang-tuas-cold-chain-centre", fundId: "loyang", name: "Tuas Cold Chain Centre", location: "Tuas South Avenue", acquired: "2016-07-11", cost: 149053186700, improvements: 12371414500, capitalWorksClaimed: 0, valuation: 203394997500 },
  { id: "loyang-changi-north-distribution-centre", fundId: "loyang", name: "Changi North Distribution Centre", location: "Changi North Rise", acquired: "2019-10-28", cost: 145213494700, improvements: 2759056400, capitalWorksClaimed: 0, valuation: 165729257200 },
  { id: "loyang-senoko-industrial-park", fundId: "loyang", name: "Senoko Industrial Park", location: "Senoko Drive", acquired: "2021-06-14", cost: 130602428300, improvements: 1044819400, capitalWorksClaimed: 0, valuation: 135596665100 },

  // meranti
  { id: "meranti-meranti-dc1", fundId: "meranti", name: "Meranti DC1", location: "Loyang Way", acquired: "2019-04-01", cost: 119606894100, improvements: 13395972100, capitalWorksClaimed: 0, valuation: 183543955300 },
  { id: "meranti-meranti-dc2", fundId: "meranti", name: "Meranti DC2", location: "Tai Seng Drive", acquired: "2023-01-16", cost: 117134318600, improvements: 4802507100, capitalWorksClaimed: 0, valuation: 132911140000 },

  // kallang
  { id: "kallang-kallang-riverside-mall", fundId: "kallang", name: "Kallang Riverside Mall", location: "Kallang Bahru", acquired: "2010-08-02", cost: 174633206800, improvements: 26544247400, capitalWorksClaimed: 0, valuation: 215259876000 },
  { id: "kallang-jurong-junction", fundId: "kallang", name: "Jurong Junction", location: "Jurong Gateway Road", acquired: "2014-11-24", cost: 162168177100, improvements: 15243808600, capitalWorksClaimed: 0, valuation: 161444907000 },
  { id: "kallang-punggol-waterway-point", fundId: "kallang", name: "Punggol Waterway Point", location: "Punggol Central", acquired: "2017-05-08", cost: 92568967200, improvements: 5276431100, capitalWorksClaimed: 0, valuation: 112522208000 },
];
