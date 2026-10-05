import React, { useState } from "react";
import { BOOK_TITLE, TEACHER_BOOK_TITLE } from "../constants/bookMeta";
import frontCover from "../assets/front.jpg";
import backCover from "../assets/back.jpg";
import teacherCover from "../assets/teacher.jpg";
import teacherBackCover from "../assets/teacher-back.jpg";

type FlipBookCardProps = {
  title: string;
  frontSrc: string;
  backSrc: string;
  frontAlt: string;
  backAlt: string;
};

function FlipBookCard({ title, frontSrc, backSrc, frontAlt, backAlt }: FlipBookCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <figure className={`book-flip ${flipped ? "is-flipped" : ""}`}>
      <button
        type="button"
        className="book-flip__hit"
        aria-pressed={flipped}
        aria-label={`${title}. ${flipped ? "Showing back cover. Activate to show front." : "Showing front cover. Activate to show back."}`}
        onClick={() => setFlipped((value) => !value)}
      >
        <span className="book-flip__stage">
          <span className="book-flip__inner">
            <span className="book-flip__face book-flip__face--front">
              <img src={frontSrc} alt={frontAlt} width={640} height={960} decoding="async" />
            </span>
            <span className="book-flip__face book-flip__face--back">
              <img src={backSrc} alt={backAlt} width={640} height={960} decoding="async" />
            </span>
          </span>
        </span>
      </button>
      <figcaption className="book-flip__caption">{title}</figcaption>
    </figure>
  );
}

type BookEditionShowcaseProps = {
  compact?: boolean;
};

export default function BookEditionShowcase({ compact = false }: BookEditionShowcaseProps) {
  return (
    <div className={`book-edition ${compact ? "book-edition--compact" : ""}`}>
      <p className="book-edition__hint">Hover or tap a cover to see the back</p>
      <div className="book-cover-pair">
        <FlipBookCard
          title="Student book"
          frontSrc={frontCover}
          backSrc={backCover}
          frontAlt={`Front cover: ${BOOK_TITLE}`}
          backAlt={`Back cover: ${BOOK_TITLE}`}
        />
        <FlipBookCard
          title="Teacher's book"
          frontSrc={teacherCover}
          backSrc={teacherBackCover}
          frontAlt={`Front cover: ${TEACHER_BOOK_TITLE}`}
          backAlt={`Back cover: ${TEACHER_BOOK_TITLE}`}
        />
      </div>
    </div>
  );
}
