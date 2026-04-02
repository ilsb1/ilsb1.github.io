import React from "react";
import { Link } from "react-router-dom";
import { BOOK_TITLE } from "../constants/bookMeta";

export default function AboutBook() {
  return (
    <div className="about-page">
      <div className="page-header">
        <h2 className="page-title">About the Book</h2>
        <p className="page-subtitle">{BOOK_TITLE}</p>
      </div>

      <article className="about-content about-content--book" aria-labelledby="about-book-heading">
        <header className="book-hero" id="about-book-heading">
          <h3 className="book-title">{BOOK_TITLE}</h3>
        </header>

        <div className="about-prose about-text-block about-text-block--flush">
          <p>
            It is my pleasure to present {BOOK_TITLE}, a teaching resource created to support
            undergraduate learners in their academic journey of developing confident and purposeful
            communication. This book is shaped by over twenty years of my personal experience in
            teaching English at all levels as well as by long-term observation of B1 learners&apos;
            studying styles, interaction patterns, educational challenges and academic progress
            within higher education context.
          </p>
          <p>
            This teaching resource is closely aligned with Common European Framework of References
            (CEFR) B1 descriptors as well as well informed by the Cambridge TKT framework, ensuring
            internationally relevant, sound and state-of-art methodology. Moreover, it reflects core
            TESOL and ELT principles, including strong reliance on communicative language teaching,
            task-based learning, learner autonomy, and reflective practice based on critical
            thinking tasks. Altogether, these principles are applied in a practical, student-centered
            classroom approach, allowing students to engage actively with language rather than learn
            it theoretically.
          </p>
          <p>
            Listening, reading, speaking, and writing skills are equally integrated into each unit
            so that skills develop simultaneously. In addition, each language input in the units is
            immediately followed by a meaningful output, helping learners build a balanced focus on
            fluency and accuracy at the same time. Topical vocabulary, idioms, proverbs and
            functional language are presented in level-specific context as well as recycled through
            various tasks to encourage classroom engagement and real world language use.
          </p>
          <p>
            Texts and listening activities are based on exposure to authentic, native-speaker
            sources, offering natural language in real academic and social communication samples.
            There is a particular focus on Critical Thinking and Academic Writing that are carefully
            scaffolded to guide students with step-by-step coherent writing:
            topic/supporting/concluding sentence paragraphs and academic essays.
          </p>
          <p>
            Moreover, the teaching aid creates modern learning environments suggesting thoughtful use
            of multiple digital resources and global online study platforms. Selected educational AI
            tools are ethically included only as supportive aids for feedback and layout, with full
            academic integrity respect and copyright. Here, technology is used to enhance learning,
            not to replace it.
          </p>
          <p>
            Overall, this teaching resource is flexible, student-centred and teacher-friendly, due to
            its easy adaptability to different institutional contexts and teaching and learning
            styles. My hope is that it will help learners use academic English with clear purpose and
            confidence while making the study process engaging and enjoyable.
          </p>
        </div>

        <aside className="about-signature" aria-label="Author">
          <p className="about-signature__name">Dr. Sevinj Aghahuseyn Hasanova</p>
          <p className="about-signature__role">
            Associate Professor of the
            <br />
            Chair of English Lexicology
            <br />
            Azerbaijan University of Languages
          </p>
        </aside>

        <footer className="about-footer-nav">
          <Link to="/listenings" className="about-footer-nav__link about-footer-nav__link--secondary">
            ← Listening exercises
          </Link>
          <Link to="/about/author" className="about-footer-nav__link">
            About the author →
          </Link>
        </footer>
      </article>
    </div>
  );
}
