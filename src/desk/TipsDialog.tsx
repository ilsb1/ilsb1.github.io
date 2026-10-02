import Modal from "./Modal";
import { MOD } from "./format";
import { IconX } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

const TIPS: { title: string; body: string; keys?: string[] }[] = [
  {
    title: "Your work saves itself",
    body: "Every few seconds, without you doing anything. Nothing is public until you press Publish.",
    keys: [`${MOD}S`],
  },
  {
    title: "Bold, italic and underline",
    body: "Select some words, then press B, I or U in the toolbar, or in the little bar that appears above them.",
    keys: [`${MOD}B`, `${MOD}I`, `${MOD}U`],
  },
  {
    title: "Add a link",
    body: "Select the words, press Link, and paste the web address. You can also paste an address straight onto selected words.",
    keys: [`${MOD}K`],
  },
  {
    title: "Headings and quotes",
    body: "Click in a line, open the Normal text menu on the left of the toolbar and choose Heading, Subheading or Quote. After a quote, press Enter to carry on with normal text.",
  },
  {
    title: "Lists",
    body: "Use the list buttons, or type a dash and a space at the start of a line for bullets, or 1. and a space for numbers. Press Tab to indent.",
    keys: ["-", "1."],
  },
  {
    title: "Bigger or smaller words",
    body: "Select the words, then choose a size from the menu with two A's.",
  },
  {
    title: "Changed your mind?",
    body: "Undo takes back the last change. You can press it as many times as you need.",
    keys: [`${MOD}Z`],
  },
];

export default function TipsDialog({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="tips-title" className="modal--tips">
      <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
        <IconX size={18} />
      </button>
      <p className="modal__eyebrow">Help</p>
      <h2 id="tips-title" className="modal__title">
        Tips for the writing desk
      </h2>
      <ul className="tips">
        {TIPS.map((tip) => (
          <li key={tip.title} className="tips__item">
            <div>
              <p className="tips__title">{tip.title}</p>
              <p className="tips__body">{tip.body}</p>
            </div>
            {tip.keys ? (
              <div className="tips__keys">
                {tip.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="modal__actions">
        <span />
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
