import type { IntakeQuestion, ProblemCategory } from "@/types/domain";

/**
 * Intake — one question at a time, plain language, only relevant follow-ups.
 * Never overwhelm with long forms.
 */

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "q_what_happened",
    key: "what_happened",
    question: "What happened? Tell us in your own words.",
    questionHi: "क्या हुआ? अपने शब्दों में बताइए।",
    type: "text",
    required: true,
    relevantCategories: [],
    helpText: "Just describe what went wrong — we'll help structure it.",
  },
  {
    id: "q_category_confirm",
    key: "problem_category",
    question: "Which of these best describes your problem?",
    questionHi: "इनमें से आपकी समस्या कौन सी है?",
    type: "choice",
    required: true,
    relevantCategories: [],
    choices: [
      { value: "security_deposit", label: "Security deposit not returned", labelHi: "सिक्योरिटी डिपॉजिट वापस नहीं मिला" },
      { value: "cheque_bounce", label: "Cheque-related issue", labelHi: "चेक से जुड़ी समस्या" },
      { value: "consumer_complaint", label: "Consumer complaint", labelHi: "उपभोक्ता शिकायत" },
      { value: "salary_delay", label: "Salary / final settlement not paid", labelHi: "सैलरी नहीं मिली" },
      { value: "legal_notice", label: "I received a legal notice", labelHi: "मुझे लीगल नोटिस मिला" },
      { value: "other", label: "Something else", labelHi: "कुछ और" },
    ],
  },
  {
    id: "q_when",
    key: "incident_date",
    question: "When did this happen?",
    questionHi: "यह कब हुआ?",
    type: "date",
    required: false,
    relevantCategories: [],
  },
  {
    id: "q_amount",
    key: "amount_involved",
    question: "Is there a money amount involved? If yes, how much?",
    questionHi: "क्या इसमें कोई राशि शामिल है? कितनी?",
    type: "number",
    required: false,
    relevantCategories: ["security_deposit", "cheque_bounce", "consumer_complaint", "salary_delay", "other"],
  },
  {
    id: "q_opposing_party",
    key: "opposing_party",
    question: "Who is the other person or company involved?",
    questionHi: "दूसरी पार्टी कौन है?",
    type: "text",
    required: false,
    relevantCategories: [],
    helpText: "E.g. landlord name, employer, shop/seller — just a name is enough.",
  },
  {
    id: "q_document",
    key: "has_document",
    question: "Did you receive any document, message, or notice about this?",
    questionHi: "क्या आपको इससे जुड़ा कोई दस्तावेज़ या मैसेज मिला है?",
    type: "boolean",
    required: false,
    relevantCategories: [],
  },
  {
    id: "q_what_you_want",
    key: "desired_outcome",
    question: "What would you ideally like to happen?",
    questionHi: "आप क्या चाहते हैं कि हो?",
    type: "choice",
    required: false,
    relevantCategories: [],
    choices: [
      { value: "refund", label: "Get my money back", labelHi: "पैसा वापस मिले" },
      { value: "action", label: "They should fix / take action", labelHi: "वे सुधार करें" },
      { value: "reply", label: "Reply to a notice", labelHi: "नोटिस का जवाब देना" },
      { value: "understand", label: "Just understand my options", labelHi: "सिर्फ विकल्प समझना" },
    ],
  },
];

export function questionsForCategory(category: ProblemCategory | null): IntakeQuestion[] {
  if (!category) return INTAKE_QUESTIONS.slice(0, 3);
  return INTAKE_QUESTIONS.filter(
    (q) => q.relevantCategories.length === 0 || q.relevantCategories.includes(category)
  );
}
