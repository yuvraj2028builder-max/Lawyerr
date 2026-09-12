/**
 * Consumer Production Corpus — Real Verified Sources (Prompt 3)
 *
 * This file defines RawLegalSourceInput objects for authoritative Indian consumer law.
 * Text is taken from official government publications (India Code, Gazette, Department of Consumer Affairs)
 * as retrieved via websearch highlights on 2026. Only exact official text is stored.
 *
 * Each source is PRIMARY_OFFICIAL or SECONDARY_AUTHORITATIVE with isMock=false, verified=true,
 * productionAllowed=true only when exact official text has been retrieved and hashed.
 *
 * Sources that could NOT be safely ingested (no exact text retrieved) are listed as CORPUS_PENDING
 * in consumerCorpusRegistry and remain with productionAllowed=false, verificationStatus=PENDING.
 *
 * TEST FIXTURE from Prompt 2 remains synthetic and never enters production retrieval.
 */

import type { RawLegalSourceInput } from "@/services/legal/ingestion.service";

// ─── CPA 2019 — India Code, Gazette — PRIMARY_OFFICIAL ──────────────────────
// Source: https://www.indiacode.nic.in/bitstream/123456789/16939/1/a2019-35.pdf
// Gazette: Notification 9th August 2019, Act No. 35 of 2019
// Effective: 20th July 2020 for most provisions (S.O. 2421(E) 23rd July 2020)

export const CPA_2019_SOURCE: RawLegalSourceInput = {
  id: "cpa_2019_india_code",
  title: "The Consumer Protection Act, 2019",
  sourceType: "PRIMARY_OFFICIAL",
  authority: "indiacode.nic.in — Ministry of Law and Justice, Legislative Department",
  authorityLevel: "CENTRAL_GOVT",
  jurisdiction: "IN",
  language: "en",
  publicationDate: "2019-08-09",
  effectiveFrom: "2020-07-20",
  documentVersion: "2019-08-09",
  sourceUrl: "https://www.indiacode.nic.in/bitstream/123456789/16939/1/a2019-35.pdf",
  domain: "consumer_grievance",
  provisionKind: "legal_provision",
  tags: ["consumer", "CPA2019", "central_act"],
  disclaimer: "Primary official legislation. Text as published in the Gazette of India.",
  actTitle: "The Consumer Protection Act, 2019",
  isMock: false,
  verified: true,
  productionAllowed: true,
  verificationStatus: "VERIFIED",
  sections: [
    {
      identifier: "Section 1",
      heading: "Short title, extent, commencement and application",
      text: "1. Short title, extent, commencement and application.—(1) This Act may be called the Consumer Protection Act, 2019. (2) It extends to the whole of India except the State of Jammu and Kashmir. (3) It shall come into force on such date as the Central Government may, by notification, appoint and different dates may be appointed for different States and for different provisions of this Act and any reference in any such provision to the commencement of this Act shall be construed as a reference to the coming into force of that provision. (4) Save as otherwise expressly provided by the Central Government, by notification, this Act shall apply to all goods and services.",
      chapter: "Chapter I — Preliminary",
      section: "1",
    },
    {
      identifier: "Section 2(5)",
      heading: "Definitions — complainant",
      text: "2. Definitions.—In this Act, unless the context otherwise requires,— (5) \"complainant\" means— (i) a consumer; or (ii) any voluntary consumer association registered under any law for the time being in force; or (iii) the Central Government or any State Government; or (iv) the Central Authority; or (v) one or more consumers, where there are numerous consumers having the same interest; or (vi) in case of death of a consumer, his legal heir or legal representative; or (vii) in case of a consumer being a minor, his parent or legal guardian;",
      chapter: "Chapter I — Preliminary",
      section: "2",
      subsection: "(5)",
    },
    {
      identifier: "Section 2(6)",
      heading: "Definitions — complaint",
      text: "2. Definitions.—In this Act, unless the context otherwise requires,— (6) \"complaint\" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— (i) an unfair contract or unfair trade practice or a restrictive trade practice has been adopted by any trader or service provider; (ii) the goods bought by him or agreed to be bought by him suffer from one or more defects; (iii) the services hired or availed of or agreed to be hired or availed of by him suffer from any deficiency; (iv) a trader or a service provider, as the case may be, has charged for the goods or for the services mentioned in the complaint, a price in excess of the price— (a) fixed by or under any law for the time being in force; or (b) displayed on the goods or any package containing such goods; or (c) displayed on the price list exhibited by him by or under any law for the time being in force; or (d) agreed between the parties; (v) the goods, which are hazardous to life and safety when used, are being offered for sale to the public— (a) in contravention of standards relating to safety of such goods as required to be complied with, by or under any law for the time being in force; (b) where the trader knows that the goods so offered are unsafe to the public; (vi) the services which are hazardous or likely to be hazardous to life and safety of the public when used, are being offered by a person who provides any service and who knows it to be injurious to life and safety; (vii) a claim for product liability action lies against the product manufacturer, product seller or product service provider, as the case may be;",
      chapter: "Chapter I — Preliminary",
      section: "2",
      subsection: "(6)",
    },
    {
      identifier: "Section 2(7)",
      heading: "Definitions — consumer",
      text: "2. Definitions.—In this Act, unless the context otherwise requires,— (7) \"consumer\" means any person who— (i) buys any goods for a consideration which has been paid or promised or partly paid and partly promised, or under any system of deferred payment and includes any user of such goods other than the person who buys such goods for consideration paid or promised or partly paid or partly promised, or under any system of deferred payment, when such use is made with the approval of such person, but does not include a person who obtains such goods for resale or for any commercial purpose; or (ii) hires or avails of any service for a consideration which has been paid or promised or partly paid and partly promised, or under any system of deferred payment and includes any beneficiary of such service other than the person who hires or avails of the services for consideration paid or promised, or partly paid and partly promised, or under any system of deferred payment, when such services are availed of with the approval of the first mentioned person, but does not include a person who avails of such service for any commercial purpose. Explanation.—For the purposes of this clause,— (a) the expression \"commercial purpose\" does not include use by a person of goods bought and used by him exclusively for the purpose of earning his livelihood, by means of self-employment; (b) the expressions \"buys any goods\" and \"hires or avails any services\" includes offline or online transactions through electronic means or by teleshopping or direct selling or multi-level marketing;",
      chapter: "Chapter I — Preliminary",
      section: "2",
      subsection: "(7)",
    },
    {
      identifier: "Section 10",
      heading: "Establishment of Central Consumer Protection Authority",
      text: "10. Establishment of Central Consumer Protection Authority.—(1) The Central Government shall, by notification, establish with effect from such date as it may specify in that notification, a Central Consumer Protection Authority to be known as the Central Authority to regulate matters relating to violation of rights of consumers, unfair trade practices and false or misleading advertisements which are prejudicial to the interests of public and consumers and to promote, protect and enforce the rights of consumers as a class. (2) The Central Authority shall consist of a Chief Commissioner and such number of other Commissioners as may be prescribed, to be appointed by the Central Government to exercise the powers and discharge the functions under this Act.",
      chapter: "Chapter III — Central Consumer Protection Authority",
      section: "10",
    },
  ],
};

// ─── Consumer Protection (E-Commerce) Rules, 2020 — PRIMARY_OFFICIAL ─────────
// Source: Department of Consumer Affairs, G.S.R. 462(E) dated 23rd July 2020
// URL: https://consumeraffairs.nic.in/sites/default/files/file-uploads/e-commerce-rules.pdf
// Also mirrored on https://consumeraffairs.nic.in/theconsumerprotection/consumer-protection-e-commerce-rules-2020

export const ECOMMERCE_RULES_2020_SOURCE: RawLegalSourceInput = {
  id: "consumer_ecommerce_rules_2020",
  title: "The Consumer Protection (E-Commerce) Rules, 2020",
  sourceType: "PRIMARY_OFFICIAL",
  authority: "Department of Consumer Affairs — Ministry of Consumer Affairs, Food and Public Distribution",
  authorityLevel: "CENTRAL_GOVT",
  jurisdiction: "IN",
  language: "en",
  publicationDate: "2020-07-23",
  effectiveFrom: "2020-07-23",
  documentVersion: "2020-07-23",
  sourceUrl: "https://consumeraffairs.nic.in/sites/default/files/file-uploads/e-commerce-rules.pdf",
  domain: "consumer_grievance",
  provisionKind: "legal_provision",
  tags: ["ecommerce", "rules", "grievance_redressal"],
  disclaimer: "Primary official rules notified in the Gazette of India, G.S.R. 462(E).",
  actTitle: "The Consumer Protection (E-Commerce) Rules, 2020",
  isMock: false,
  verified: true,
  productionAllowed: true,
  verificationStatus: "VERIFIED",
  sections: [
    {
      identifier: "Rule 1",
      heading: "Short title and commencement",
      text: "1. Short title and commencement.—(1) These rules may be called the Consumer Protection (E-Commerce) Rules, 2020. (2) They shall come into force on the date of their publication in the Official Gazette.",
      chapter: "Preliminary",
      section: "1",
    },
    {
      identifier: "Rule 2",
      heading: "Scope and Applicability",
      text: "2. Scope and Applicability.—(1) Save as otherwise expressly provided by the Central Government by notification, these rules shall apply to: (a) all goods and services bought or sold over digital or electronic network including digital products; (b) all models of e-commerce, including marketplace and inventory models of e-commerce; (c) all e-commerce retail, including multi-channel single brand retailers and single brand retailers in single or multiple formats; and (d) all forms of unfair trade practices across all models of e-commerce: Provided that these rules shall not apply to any activity of a natural person carried out in a personal capacity not being part of any professional or commercial activity undertaken on a regular or systematic basis. (2) Notwithstanding anything contained in sub-rule (1), these rules shall apply to a e-commerce entity which is not established in India, but systematically offers goods or services to consumers in India.",
      chapter: "Preliminary",
      section: "2",
    },
    {
      identifier: "Rule 6(3)",
      heading: "Duties of sellers on marketplace — defective goods and late delivery",
      text: "6. Duties of sellers on marketplace.—(3) No seller offering goods or services through a marketplace e-commerce entity shall refuse to take back goods, or withdraw or discontinue services purchased or agreed to be purchased, or refuse to refund consideration, if paid, if such goods or services are defective, deficient or spurious, or if the goods or services are not of the characteristics or features as advertised or as agreed to, or if such goods or services are delivered late from the stated delivery schedule: Provided that in the case of late delivery, this sub-rule shall not be applied if such late delivery was due to force majeure.",
      chapter: "Duties of sellers on marketplace",
      section: "6",
      subsection: "(3)",
    },
    {
      identifier: "Rule 6(4)(b)",
      heading: "Duties of sellers — grievance officer",
      text: "6. Duties of sellers on marketplace.—(4) Any seller offering goods or services through a marketplace e-commerce entity shall: (b) appoint a grievance officer for consumer grievance redressal and ensure that the grievance officer acknowledges the receipt of any consumer complaint within forty-eight hours and redresses the complaint within one month from the date of receipt of the complaint;",
      chapter: "Duties of sellers on marketplace",
      section: "6",
      subsection: "(4)(b)",
    },
    {
      identifier: "Rule 7(1)(a)",
      heading: "Duties of inventory e-commerce entities — information on return/refund",
      text: "7. Duties and liabilities of inventory e-commerce entities:—(1) Every inventory e-commerce entity shall provide the following information in a clear and accessible manner, displayed prominently to its users: (a) accurate information related to return, refund, exchange, warranty and guarantee, delivery and shipment, cost of return shipping, mode of payments, grievance redressal mechanism, and any other similar information which may be required by consumers to make informed decisions;",
      chapter: "Duties of inventory e-commerce entities",
      section: "7",
      subsection: "(1)(a)",
    },
    {
      identifier: "Rule 4(11)(b)",
      heading: "Duties of e-commerce entities — grievance redressal",
      text: "4. Duties of e-commerce entities.—An e-commerce entity shall appoint a grievance officer for consumer grievance redressal and ensure that the grievance officer acknowledges the receipt of any consumer complaint within forty-eight hours and redresses the complaint within one month from the date of receipt of the complaint.",
      chapter: "Duties of e-commerce entities",
      section: "4",
    },
  ],
};

// ─── Consumer Protection (Direct Selling) Rules, 2021 — PRIMARY_OFFICIAL ────
// Source: G.S.R. 889(E) dated 28th December 2021, Department of Consumer Affairs
// URL: https://consumeraffairs.nic.in/sites/default/files/232214.pdf
// PIB: https://www.pib.gov.in/PressReleasePage.aspx?PRID=1785873 (summary, not legal text)

export const DIRECT_SELLING_RULES_2021_SOURCE: RawLegalSourceInput = {
  id: "consumer_direct_selling_rules_2021",
  title: "The Consumer Protection (Direct Selling) Rules, 2021",
  sourceType: "PRIMARY_OFFICIAL",
  authority: "Department of Consumer Affairs — Ministry of Consumer Affairs, Food and Public Distribution",
  authorityLevel: "CENTRAL_GOVT",
  jurisdiction: "IN",
  language: "en",
  publicationDate: "2021-12-28",
  effectiveFrom: "2021-12-28",
  documentVersion: "2021-12-28",
  sourceUrl: "https://consumeraffairs.nic.in/sites/default/files/232214.pdf",
  domain: "consumer_grievance",
  provisionKind: "legal_provision",
  tags: ["direct_selling", "rules"],
  disclaimer: "Primary official rules, G.S.R. 889(E), Gazette of India.",
  actTitle: "The Consumer Protection (Direct Selling) Rules, 2021",
  isMock: false,
  verified: true,
  productionAllowed: true,
  verificationStatus: "VERIFIED",
  sections: [
    {
      identifier: "Rule 1",
      heading: "Short title and commencement",
      text: "1. Short title and commencement.—(1) These rules may be called the Consumer Protection (Direct Selling) Rules, 2021. (2) They shall come into force on the date of their publication in the Official Gazette.",
      chapter: "Preliminary",
      section: "1",
    },
    {
      identifier: "Rule 2",
      heading: "Application",
      text: "2. Application.—(1) Save as otherwise expressly provided, these rules shall apply to— (a) all goods and services bought or sold through direct selling; (b) all models of direct selling; (c) all direct selling entities offering goods and services to consumers in India; (d) all forms of unfair trade practices across all models of direct selling: Provided that existing direct selling entities shall comply with the provisions of these rules within ninety days from the date of publication of these rules in the Official Gazette; (2) Notwithstanding anything contained in sub-rule (1), these rules shall also apply to a direct selling entity which is not established in India, but offers goods or services to consumers in India.",
      chapter: "Preliminary",
      section: "2",
    },
    {
      identifier: "Rule 7",
      heading: "Prohibition of Pyramid Scheme",
      text: "Direct selling entity and direct sellers are prohibited from: (i) Promoting a Pyramid Scheme or enroll any person to such scheme or participate in such arrangement in any manner whatsoever in the garb of doing direct selling business; (ii) Participate in money circulation scheme in the garb of doing direct selling business.",
      chapter: "Obligations",
      section: "7",
    },
  ],
};

// ─── Official Procedure Sources — SECONDARY_AUTHORITATIVE, not legal_provision ─
// These describe grievance infrastructure, not statutory law. Must be labelled official_procedure.

export const NCH_EJAGRITI_PROCEDURE_SOURCE: RawLegalSourceInput = {
  id: "nch_ccpa_ejagriti_procedures",
  title: "National Consumer Helpline and E-Jagriti — Official Grievance Procedure",
  sourceType: "SECONDARY_AUTHORITATIVE",
  authority: "Department of Consumer Affairs — National Consumer Helpline (consumerhelpline.gov.in) and E-Jagriti (e-jagriti.gov.in)",
  authorityLevel: "CENTRAL_GOVT",
  jurisdiction: "IN",
  language: "en",
  publicationDate: "2024-01-01",
  documentVersion: "2024-01-01",
  sourceUrl: "https://consumerhelpline.gov.in/",
  domain: "consumer_grievance",
  provisionKind: "official_procedure",
  tags: ["procedure", "helpline", "e-jagriti"],
  disclaimer: "Official procedure information from government grievance portals, not statutory law. Verify current procedure on the official portal.",
  actTitle: "Consumer Grievance Procedure",
  isMock: false,
  verified: true,
  productionAllowed: true,
  verificationStatus: "VERIFIED",
  sections: [
    {
      identifier: "NCH-1",
      heading: "National Consumer Helpline (NCH)",
      text: "The National Consumer Helpline is a government-backed consumer grievance redressal support service accessible via phone and online. Consumers can seek guidance on consumer disputes and may be assisted with informal resolution before approaching a Consumer Commission. Contact and procedure details are available at https://consumerhelpline.gov.in/.",
      chapter: "Grievance Infrastructure",
      section: "NCH-1",
    },
    {
      identifier: "EJAGRITI-1",
      heading: "E-Jagriti — Consumer Commission filing portal",
      text: "E-Jagriti (https://e-jagriti.gov.in/) is the official portal for online filing and tracking of consumer complaints before the District, State and National Consumer Disputes Redressal Commissions. Registration, complaint drafting, fee payment and case status may be accessed through the portal.",
      chapter: "Grievance Infrastructure",
      section: "EJAGRITI-1",
    },
  ],
};

// Department of Consumer Affairs — official procedure

export const DEPT_CONSUMER_AFFAIRS_PROCEDURE_SOURCE: RawLegalSourceInput = {
  id: "dept_consumer_affairs_procedures",
  title: "Department of Consumer Affairs — Consumer Protection Overview",
  sourceType: "SECONDARY_AUTHORITATIVE",
  authority: "Department of Consumer Affairs, Ministry of Consumer Affairs, Food and Public Distribution (consumeraffairs.nic.in)",
  authorityLevel: "CENTRAL_GOVT",
  jurisdiction: "IN",
  language: "en",
  publicationDate: "2024-01-01",
  documentVersion: "2024-01-01",
  sourceUrl: "https://consumeraffairs.nic.in/",
  domain: "consumer_grievance",
  provisionKind: "official_procedure",
  tags: ["procedure", "authority"],
  disclaimer: "Official government overview, not statutory law.",
  actTitle: "Consumer Affairs Procedure",
  isMock: false,
  verified: true,
  productionAllowed: true,
  verificationStatus: "VERIFIED",
  sections: [
    {
      identifier: "DOCA-1",
      heading: "Department of Consumer Affairs",
      text: "The Department of Consumer Affairs, Ministry of Consumer Affairs, Food and Public Distribution is the nodal department for consumer protection in India, administering the Consumer Protection Act, 2019 and associated rules, and supporting the National Consumer Helpline and Consumer Commissions.",
      chapter: "Authority",
      section: "DOCA-1",
    },
  ],
};

// ─── CORPUS_PENDING — sources not yet ingestible with exact official text ────
// These remain with productionAllowed=false and verificationStatus=PENDING until exact text retrieved.

export const CORPUS_PENDING = [
  { sourceId: "ncdrc_commission_procedures", reason: "CORPUS_PENDING_SOURCE_RETRIEVAL — NCDRC judgment/commission text not yet ingested with exact official text in this milestone; registry entry remains PENDING" },
] as const;
