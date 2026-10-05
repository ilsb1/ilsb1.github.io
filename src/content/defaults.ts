import { BOOK_TITLE } from "../constants/bookMeta";
import { unitScripts } from "../data/listeningScripts";
import { getDisplayUnitNumber, units } from "../data/listenings";
import { UNIT_IDS } from "../../shared/pages.js";

export type ImageValue = { src: string; width: number; height: number };
export type FieldValue = string | string[] | ImageValue;
export type FieldValues = Record<string, FieldValue>;

const authorPhoto = new URL("../assets/author.jpg", import.meta.url).href;

const HOME_INTRO = [
  "<p>A CEFR B1 teaching resource for undergraduates: reading/listening and speaking/writing are developed in parallel across units, with structured work in critical thinking and academic writing, and recurrent attention to vocabulary in use, idioms in use, and proverbs in use.</p>",
  "<p>",
  '<strong>1. Audio:</strong> Open <a href="/listenings">Listening recordings</a> to access tracks.<br>',
  '<strong>2. Scripts:</strong> Read <a href="/listening-scripts">Listening scripts</a> with unit-by-unit transcripts.<br>',
  '<strong>3. Overview:</strong> Visit <a href="/about/book">About the book</a> for more information.<br>',
  '<strong>4. Author:</strong> Read <a href="/about/author">About the author</a> for biographical context.<br>',
  '<strong>5. Copyright:</strong> See the <a href="/copyright">Copyright &amp; credits</a> page for the imprint and rights notice.<br>',
  '<strong>6. Blog:</strong> Read <a href="/blog">the author\'s blog</a>.',
  "</p>",
].join("");

const ABOUT_BOOK_BODY = [
  `It is my pleasure to present ${BOOK_TITLE}, a teaching resource created to support undergraduate learners in their academic journey of developing confident and purposeful communication. This book is shaped by over twenty years of my personal experience in teaching English at all levels, as well as by long-term observation of B1 learners' study styles, interaction patterns, educational challenges and academic progress within a higher education context.`,
  "This teaching resource is closely aligned with Common European Framework of References (CEFR) B1 descriptors as well as well-informed by the Cambridge TKT framework, ensuring internationally relevant, sound and state-of-the-art methodology. Moreover, it reflects core TESOL and ELT principles, including strong reliance on communicative language teaching, task-based learning, learner autonomy, and reflective practice based on critical thinking tasks. Altogether, these principles are applied in a practical, student-centred classroom approach, allowing students to engage actively with language rather than learn it theoretically.",
  "Listening, reading, speaking, and writing skills are equally integrated into each unit so that skills develop simultaneously. In addition, each language input in the units is immediately followed by a meaningful output, helping learners build a balanced focus on fluency and accuracy at the same time. Topical vocabulary, idioms, proverbs and functional language are presented in level-specific context as well as recycled through various tasks to encourage classroom engagement and real-world language use.",
  "Texts and Listening activities are based on exposure to authentic, native-speaker sources, offering natural language in real academic and social communication samples. There is a particular focus on Critical Thinking and Academic Writing that are carefully scaffolded to guide students with step-by-step coherent writings: punctuation/capitalization rules → topic/supporting/concluding sentences → paragraphs → academic essays.",
  "Moreover, the teaching resource creates modern learning environments, suggesting thoughtful use of multiple digital resources and global online study platforms. Selected educational AI tools are used ethically only as supportive aids for feedback and layout, with full respect for academic integrity and copyright. Here, technology is used to enhance learning, not to replace it.",
  "Overall, this book is flexible, student-centred and teacher-friendly, due to its easy adaptability to different institutional contexts and diverse teaching and learning styles. I sincerely hope that this book will achieve its main goal and help learners use academic English with confidence and a clear sense of purpose, while making the learning process more engaging, enjoyable, and meaningful for both students and teachers.",
]
  .map((paragraph) => `<p>${paragraph}</p>`)
  .join("");

const RESEARCH_INTERESTS = [
  "Linguistics",
  "Lexicology",
  "Stylistics",
  "Inclusive Education",
  "Linguaculturology",
  "Large Language Models (LLMs)",
  "Natural Language Processing (NLP)",
  "Integration of Ethical AI in ELT",
];

const AUTHOR_BIO = [
  "<p>Sevinj Hasanova is an Associate Professor at the Department of English Lexicology at the Azerbaijan University of Languages. She was born on October 8, 1982, in Baku, Azerbaijan.</p>",
  "<h3>Education</h3>",
  "<p>Dr. Hasanova holds a PhD in Philology (2016) from the Azerbaijan University of Languages, where she defended her dissertation entitled “The Communicative Aspect of Literary Text as a Unit of Culture.” She also completed her MA (2006) and BA (2003) in English Language at the same institution, receiving full state merit scholarships and graduating with highest honours in both programmes, with a GPA of 4.0/4.0.</p>",
  "<h3>Teaching</h3>",
  "<p>She has been actively engaged in teaching and academic work since 2007, beginning her career as an instructor at the university's TOEFL IBT Centre. Since 2008, she has served as a lecturer in the Department of English Lexicology, where she was promoted to Senior Lecturer in 2015 and appointed as an internal Associate Professor in 2024. Throughout her career, she has taught a wide range of courses, including Practical English, Stylistics, Academic Writing, and advanced communication-focused subjects.</p>",
  "<h3>Academic service and leadership</h3>",
  "<p>In addition to her teaching responsibilities, Dr. Hasanova has held several important academic and administrative roles. Since 2019, she has served as the Head of the Language Skills discipline and is a certified specialist in online and distant learning. She is also a member of the Oral Speech Examination Commission (since 2024) and the Teacher Attestation Commission (since 2025). In 2013, she represented the Azerbaijan University of Languages on the Expert Council of the State Program on Education Abroad.</p>",
  "<h3>Scholarship and professional development</h3>",
  "<p>Dr. Hasanova has participated in numerous local and international training programs and conferences. She is the author of 25 scientific articles and 10 conference papers, published in both local and international academic journals.</p>",
  "<h3>Research interests and certifications</h3>",
  `<ul>${RESEARCH_INTERESTS.map((item) => `<li>${item}</li>`).join("")}</ul>`,
].join("");

const MAIN_DEFAULTS: Record<string, FieldValues> = {
  home: { heading: BOOK_TITLE, intro: HOME_INTRO },
  "about-book": {
    title: "About the Book",
    subtitle: BOOK_TITLE,
    bookTitle: BOOK_TITLE,
    body: ABOUT_BOOK_BODY,
    signatureName: "Dr. Sevinj Aghahuseyn Hasanova",
    signatureRole: "Associate Professor of the\nChair of English Lexicology\nAzerbaijan University of Languages",
  },
  "about-author": {
    title: "About the Author",
    subtitle: `Author of ${BOOK_TITLE}`,
    name: "Dr. Sevinj Aghahuseyn Hasanova",
    affiliation: "Associate Professor · Department of English Lexicology · Azerbaijan University of Languages",
    photo: { src: authorPhoto, width: 0, height: 0 },
    scholarUrl: "https://scholar.google.com/citations?user=OIcH4IgAAAAJ&hl=ru",
    linkedinUrl: "https://www.linkedin.com/in/sevinj-hasanova-96771722a/",
    bio: AUTHOR_BIO,
  },
  copyright: {
    title: "Copyright",
    subtitle: "Rights notice and imprint",
    heroTitle: BOOK_TITLE,
    heroSubtitle: "Teaching resource · Baku, 2026 · 220 pp.",
    enHeading: "Copyright © 2026 Sevinj Aghahuseyn Hasanova",
    enStrong: "All rights reserved.",
    enBody:
      "No part of this teaching resource, its associated website, any of the content presented on that website, the audio materials, or the audio transcripts may be reproduced, stored, distributed, or transmitted in any form or by any means, without the prior written permission of the copyright holder. Only brief quotations for educational, academic, or review purposes as permitted by law may be used.",
    azHeading: "Müəllif hüququ © 2026 Sevinj Ağahüseyn Həsənova",
    azStrong: "Bütün hüquqlar qorunur.",
    azBody:
      "Bu dərs vəsaitinə, ona aid internet səhifəsinin, həmin səhifədə təqdim olunan bütün məzmunun, audio materialların və audio mətnlərinin heç bir hissəsi müəllif hüququ sahibinin əvvəlcədən verilmiş yazılı razılığı olmadan heç bir formada və ya vasitə ilə, çoxaldıla, saxlanıla, yayıla və ya ötürülə bilməz. Yalnız qanunvericiliklə icazə verilən tədris, akademik və ya resenziya məqsədli qısa sitatların istifadəsinə yol verilir.",
    imprintAuthor: "Sevinj A. Hasanova",
    imprintTitle: "INTEGRATED LANGUAGE SKILLS FOR HIGHER EDUCATION.",
    imprintEdition: "Teaching resource — Baku, 2026. — 220 pp.",
    isbn: "Forthcoming",
    copyrightLine: "© Sevinj Aghahuseyn Hasanova, 2026",
  },
  recordings: {
    title: "Listening Tracks",
    intro: "",
    downloadNote: "For offline use: one ZIP file with all Unit 1-12 listening tracks.",
  },
  scripts: {
    title: "Listening Scripts",
    subtitle: "Read each unit script with clear structure and quick access to matching audio.",
    intro: "",
  },
};

function unitDefaults(unit: number): FieldValues {
  return {
    title: `Unit ${getDisplayUnitNumber(unit)}`,
    subtitle: "",
    description: "",
    tracks: (units[unit] ?? []).map((track) => track.title),
  };
}

function scriptDefaults(unit: number): FieldValues {
  return {
    title: `Unit ${getDisplayUnitNumber(unit)}`,
    subtitle: unitScripts[unit]?.title ?? "",
  };
}

const DEFAULTS: Record<string, FieldValues> = { ...MAIN_DEFAULTS };
for (const unit of UNIT_IDS) {
  DEFAULTS[`unit-${unit}`] = unitDefaults(unit);
  DEFAULTS[`script-${unit}`] = scriptDefaults(unit);
}

export function pageDefaults(pageId: string): FieldValues {
  return DEFAULTS[pageId] ?? {};
}
