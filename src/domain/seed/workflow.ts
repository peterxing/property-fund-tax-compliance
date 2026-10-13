// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { Approval, AuditEntry, Lodgment, Query, User } from "../types.ts";

export const QUERIES: Query[] = [
  {
    id: "q-1",
    fundId: "kurrajong",
    subject: "Cross-staple rent: NCMI or transitional?",
    status: "open",
    raisedBy: "L. Brennan",
    raisedAt: "2026-10-08T10:47:00",
    messages: [
      { by: "L. Brennan", at: "2026-10-08T10:47:00", text: "NCMI was withheld at 15% during the year. Confirm whether the cross-staple rent is outside the transitional relief before sign-off." },
      { by: "R. Okafor", at: "2026-10-09T09:12:00", text: "The lease with the operating trust dates from 2016, so it may qualify. I've asked the deals team for the facility schedule." },
    ],
  },
  {
    id: "q-2",
    fundId: "kurrajong",
    subject: "Register short by 1,250,000 units",
    status: "open",
    raisedBy: "D. Harrow",
    raisedAt: "2026-10-10T16:03:00",
    messages: [
      { by: "D. Harrow", at: "2026-10-10T16:03:00", text: "The register holds 1,250,000 fewer units than are on issue. Please send the registry reconciliation at 30 June." },
    ],
  },
  {
    id: "q-3",
    fundId: "southbank",
    subject: "Estate sale: discount eligibility",
    status: "open",
    raisedBy: "D. Harrow",
    raisedAt: "2026-10-07T11:30:00",
    messages: [
      { by: "D. Harrow", at: "2026-10-07T11:30:00", text: "The estate sale settled on 26 June 2026. Please provide the contract dates and the cost base workpaper to confirm the 12-month holding period for the discount." },
    ],
  },
  {
    id: "q-4",
    fundId: "meranti",
    subject: "Co-location income as specified income",
    status: "resolved",
    raisedBy: "S. Lim",
    raisedAt: "2026-10-06T13:40:00",
    messages: [
      { by: "S. Lim", at: "2026-10-06T13:40:00", text: "Confirm the co-location income from DC2 is treated as specified income for tax transparency." },
      { by: "W. L. Teo", at: "2026-10-07T17:05:00", text: "Yes. Co-location income derived from 1 July 2025 is specified income following Budget 2025. Workpaper TT-04 is updated." },
      { by: "S. Lim", at: "2026-10-08T10:20:00", text: "Agreed, closing." },
    ],
  },
];

/** In the reference's file order (not sorted): consumers sort by `at` where they need newest first. */
export const AUDIT: AuditEntry[] = [
  { id: "a-01", fundId: "harbourline", at: "2026-07-28T10:12:00", actor: "R. Okafor", action: "Trust components loaded", detail: "FY2026 tax trial balance mapped to AMIT components" },
  { id: "a-02", fundId: "harbourline", at: "2026-08-21T16:40:00", actor: "R. Okafor", action: "Submitted for review" },
  { id: "a-02b", fundId: "harbourline", at: "2026-09-01T15:20:00", actor: "L. Brennan", action: "Approved — reviewer" },
  { id: "a-02c", fundId: "harbourline", at: "2026-09-07T10:05:00", actor: "D. Harrow", action: "Approved — tax agent" },
  { id: "a-03", fundId: "harbourline", at: "2026-09-09T11:05:00", actor: "A. Moreno", action: "Signed off", detail: "Components and withholding locked" },
  { id: "a-04", fundId: "southbank", at: "2026-08-05T09:30:00", actor: "R. Okafor", action: "Trust components loaded", detail: "FY2026 tax trial balance mapped to AMIT components" },
  { id: "a-05", fundId: "southbank", at: "2026-09-18T14:02:00", actor: "R. Okafor", action: "Discounted capital gains — TARP updated", detail: "A$0 → A$9,880,000 — estate sale settled 26 Jun 2026" },
  { id: "a-06", fundId: "southbank", at: "2026-10-06T17:21:00", actor: "R. Okafor", action: "Submitted for review" },
  { id: "a-07", fundId: "wattle", at: "2026-07-30T08:55:00", actor: "R. Okafor", action: "Trust components loaded", detail: "FY2026 tax trial balance mapped to AMIT components" },
  { id: "a-08", fundId: "wattle", at: "2026-08-14T15:18:00", actor: "R. Okafor", action: "Submitted for review" },
  { id: "a-08b", fundId: "wattle", at: "2026-08-27T09:40:00", actor: "L. Brennan", action: "Approved — reviewer" },
  { id: "a-09", fundId: "wattle", at: "2026-09-02T10:41:00", actor: "A. Moreno", action: "Signed off", detail: "Components and withholding locked" },
  { id: "a-10", fundId: "kurrajong", at: "2026-08-11T11:20:00", actor: "R. Okafor", action: "Trust components loaded", detail: "FY2026 tax trial balance mapped to AMIT components" },
  { id: "a-11", fundId: "kurrajong", at: "2026-09-29T16:07:00", actor: "R. Okafor", action: "Submitted for review" },
  { id: "a-12", fundId: "kurrajong", at: "2026-10-08T10:47:00", actor: "L. Brennan", action: "Query raised", detail: "Cross-staple rent: NCMI or transitional?" },
  { id: "a-12b", fundId: "kurrajong", at: "2026-10-10T16:03:00", actor: "D. Harrow", action: "Query raised", detail: "Register short by 1,250,000 units" },
  { id: "a-06b", fundId: "southbank", at: "2026-10-07T11:30:00", actor: "D. Harrow", action: "Query raised", detail: "Estate sale: discount eligibility" },
  { id: "a-13", fundId: "coastline", at: "2026-10-07T13:15:00", actor: "R. Okafor", action: "Trust components loaded", detail: "Substituted accounting period ended 30 Sep 2026" },
  { id: "a-14", fundId: "telok-ayer", at: "2026-10-09T09:20:00", actor: "W. L. Teo", action: "Distribution components loaded", detail: "3Q FY2026 tax computation" },
  { id: "a-15", fundId: "loyang", at: "2026-07-24T14:30:00", actor: "W. L. Teo", action: "Distribution components loaded", detail: "1H FY2026 tax computation" },
  { id: "a-16", fundId: "loyang", at: "2026-07-29T09:12:00", actor: "W. L. Teo", action: "Submitted for review" },
  { id: "a-16b", fundId: "loyang", at: "2026-08-01T11:15:00", actor: "N. Pillai", action: "Approved — reviewer" },
  { id: "a-17", fundId: "loyang", at: "2026-08-03T17:46:00", actor: "A. Moreno", action: "Signed off", detail: "Components and withholding locked" },
  { id: "a-18", fundId: "meranti", at: "2026-10-05T10:02:00", actor: "W. L. Teo", action: "Distribution components loaded", detail: "3Q FY2026 tax computation; co-location income treated as specified income" },
  { id: "a-19", fundId: "meranti", at: "2026-10-08T16:25:00", actor: "W. L. Teo", action: "Submitted for review" },
  { id: "a-19b", fundId: "meranti", at: "2026-10-09T14:30:00", actor: "N. Pillai", action: "Approved — reviewer" },
  { id: "a-20", fundId: "kallang", at: "2026-10-10T15:42:00", actor: "W. L. Teo", action: "Distribution components loaded", detail: "Taxable distribution set at 85% while asset enhancement works are funded" },
];

export const APPROVALS: Approval[] = [
  { fundId: "harbourline", level: "review", by: "L. Brennan", at: "2026-09-01T15:20:00" },
  { fundId: "harbourline", level: "agent", by: "D. Harrow", at: "2026-09-07T10:05:00" },
  { fundId: "wattle", level: "review", by: "L. Brennan", at: "2026-08-27T09:40:00" },
  { fundId: "loyang", level: "review", by: "N. Pillai", at: "2026-08-01T11:15:00" },
  { fundId: "meranti", level: "review", by: "N. Pillai", at: "2026-10-09T14:30:00" },
];

export const LODGMENTS: Lodgment[] = [
  { fundId: "wattle", kind: "aiir", reference: "Receipt 418806117352", date: "2026-10-02", actor: "A. Moreno" },
  { fundId: "wattle", kind: "return", reference: "Receipt 418806221407", date: "2026-10-09", actor: "A. Moreno" },
];

export const USERS: User[] = [
  { id: "a-moreno", name: "A. Moreno", title: "Head of Tax", organisation: "Fund manager", role: "head-of-tax", funds: "all" },
  { id: "l-brennan", name: "L. Brennan", title: "Tax manager, Australia", organisation: "Fund manager", role: "reviewer", funds: ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] },
  { id: "n-pillai", name: "N. Pillai", title: "Tax manager, Singapore", organisation: "Fund manager", role: "reviewer", funds: ["telok-ayer", "loyang", "meranti", "kallang"] },
  { id: "r-okafor", name: "R. Okafor", title: "Tax accountant, Australia", organisation: "Fund manager", role: "preparer", funds: ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] },
  { id: "w-l-teo", name: "W. L. Teo", title: "Tax accountant, Singapore", organisation: "Fund manager", role: "preparer", funds: ["telok-ayer", "loyang", "meranti", "kallang"] },
  { id: "d-harrow", name: "D. Harrow", title: "Registered tax agent", organisation: "Arden Tax Partners", role: "tax-agent", funds: ["harbourline", "southbank", "kurrajong"] },
  { id: "s-lim", name: "S. Lim", title: "Tax adviser", organisation: "Tanjong Tax Advisory", role: "tax-agent", funds: ["telok-ayer", "meranti"] },
  { id: "m-castillo", name: "M. Castillo", title: "Fund finance", organisation: "Fund manager", role: "finance", funds: "all" },
];
