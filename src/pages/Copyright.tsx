import React from "react";
import { Link } from "react-router-dom";
import { BOOK_TITLE } from "../constants/bookMeta";

export default function Copyright() {
  return (
    <div className="about-page copyright-page">
      <div className="page-header">
        <h2 className="page-title">Copyright</h2>
        <p className="page-subtitle">Rights notice and imprint</p>
      </div>

      <article
        className="about-content copyright-content"
        aria-labelledby="copyright-heading"
      >
        <header className="copyright-hero" id="copyright-heading">
          <h3 className="copyright-hero__title">{BOOK_TITLE}</h3>
          <p className="copyright-hero__subtitle">
            Teaching resource &middot; Baku, 2026 &middot; 220 pp.
          </p>
        </header>

        <section
          className="copyright-notices"
          aria-label="Copyright notice in English and Azerbaijani"
        >
          <div className="copyright-notice" lang="en">
            <p className="copyright-notice__heading">
              Copyright &copy; 2026 Sevinj Aghahuseyn Hasanova
            </p>
            <p className="copyright-notice__strong">All rights reserved.</p>
            <p className="copyright-notice__body">
              No part of this teaching resource, its associated website, any of
              the content presented on that website, the audio materials, or
              the audio transcripts may be reproduced, stored, distributed, or
              transmitted in any form or by any means, without the prior
              written permission of the copyright holder. Only brief quotations
              for educational, academic, or review purposes as permitted by law
              may be used.
            </p>
          </div>

          <div className="copyright-notice" lang="az">
            <p className="copyright-notice__heading">
              M&uuml;&#x259;llif h&uuml;ququ &copy; 2026 Sevinj
              A&#x11F;ah&uuml;seyn H&#x259;s&#x259;nova
            </p>
            <p className="copyright-notice__strong">
              B&uuml;t&uuml;n h&uuml;quqlar qorunur.
            </p>
            <p className="copyright-notice__body">
              Bu d&#x259;rs v&#x259;saitin&#x259;, ona aid internet
              s&#x259;hif&#x259;sinin, h&#x259;min s&#x259;hif&#x259;d&#x259;
              t&#x259;qdim olunan b&uuml;t&uuml;n m&#x259;zmunun, audio
              materiallar&#x131;n v&#x259; audio m&#x259;tnl&#x259;rinin
              he&ccedil; bir hiss&#x259;si m&uuml;&#x259;llif h&uuml;ququ
              sahibinin &#x259;vv&#x259;lc&#x259;d&#x259;n verilmi&#x15F;
              yaz&#x131;l&#x131; raz&#x131;l&#x131;&#x11F;&#x131; olmadan
              he&ccedil; bir formada v&#x259; ya vasit&#x259; il&#x259;,
              &ccedil;oxald&#x131;la, saxlan&#x131;la, yay&#x131;la v&#x259; ya
              &ouml;t&uuml;r&uuml;l&#x259; bilm&#x259;z. Yaln&#x131;z
              qanunvericilikl&#x259; icaz&#x259; veril&#x259;n t&#x259;dris,
              akademik v&#x259; ya resenziya m&#x259;qs&#x259;dli q&#x131;sa
              sitatlar&#x131;n istifad&#x259;sin&#x259; yol verilir.
            </p>
          </div>
        </section>

        <section className="copyright-imprint" aria-label="Imprint">
          <p className="copyright-imprint__author">Sevinj A. Hasanova</p>
          <p className="copyright-imprint__title">
            INTEGRATED LANGUAGE SKILLS FOR HIGHER EDUCATION.
          </p>
          <p className="copyright-imprint__edition">
            Teaching resource &mdash; Baku, 2026. &mdash; 220 pp.
          </p>
          <dl className="copyright-imprint__meta">
            <div className="copyright-imprint__row">
              <dt>ISBN</dt>
              <dd>
                <span className="copyright-imprint__pending">
                  Forthcoming
                </span>
              </dd>
            </div>
            <div className="copyright-imprint__row">
              <dt>Copyright</dt>
              <dd>&copy; Sevinj Aghahuseyn Hasanova, 2026</dd>
            </div>
          </dl>
        </section>

        <footer className="about-footer-nav">
          <Link
            to="/about/author"
            className="about-footer-nav__link about-footer-nav__link--secondary"
          >
            &larr; About the author
          </Link>
          <Link to="/" className="about-footer-nav__link">
            Back to home &rarr;
          </Link>
        </footer>
      </article>
    </div>
  );
}
